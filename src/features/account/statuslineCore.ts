/**
 * Pure transforms for the statusline tap — no IO, no vscode, no Node
 * built-ins beyond plain data. Shared by the standalone tap script
 * (which bundles this) and the host-side reader/tests.
 *
 * Claude Code hands its configured `statusLine.command` a JSON payload
 * on stdin every render. That payload is the ONLY place the Pro/Max
 * 5h/7d rate-limit utilization is exposed locally — it is server-
 * computed and cannot be derived from local files. Tapping it lets
 * Claude Manager show quota without any network call: Claude Code (the
 * authorized client) does the fetch, we read the cached result.
 *
 * `extractCache` is deliberately defensive: the payload shape is owned
 * by Claude Code and may gain/lose fields across releases, so every
 * field is optional and absent data maps to null rather than throwing.
 */

/** One session's most recent statusline render. */
export interface SessionCapture {
  /** Model that session was running at capture time. */
  model: { id: string; displayName: string } | null;
  /** Epoch ms of that render. */
  capturedAt: number;
  /**
   * Claude Code's own running cost for that session, in USD.
   *
   * This is the authoritative figure: Claude computes it from the real
   * response usage with the correct cache-TTL and per-model rates, so
   * it needs no pricing table of ours. Undefined on captures written by
   * an older tap.
   */
  costUsd?: number;
  /** Context-window usage percentage at that render. */
  contextPercent?: number;
}

/** Normalised subset of the statusline payload we persist + render. */
export interface StatuslineCache {
  /** Epoch ms when the tap captured this (NOT from the payload). */
  capturedAt: number;
  /** Claude Code version string, e.g. "2.1.86". Empty when absent. */
  version: string;
  /**
   * The rendering session's `/rename` title, or "" when never renamed.
   * Authoritative — it beats any title we infer by scanning the
   * transcript head.
   */
  sessionName: string;
  /** Active model, or null when the payload omitted it. */
  model: { id: string; displayName: string } | null;
  /** Context-window usage for the current session, or null. */
  context: ContextUsage | null;
  /** Current-session cost + edit counters, or null. */
  cost: {
    totalUsd: number;
    durationMs: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  /** Rolling rate-limit windows. Any side is null when absent. */
  rateLimits: {
    fiveHour: RateWindow | null;
    sevenDay: RateWindow | null;
    /**
     * Gateway spend cap, present only behind a Claude gateway that sets
     * one. Unlike the subscription windows this can exceed 100 — the
     * gateway reports overspend rather than clamping — so nothing here
     * may assume a 0-100 range.
     */
    spendLimit: RateWindow | null;
  };
  /**
   * Per-session captures keyed by Claude's session_id. The top-level
   * fields are last-writer-wins across concurrent sessions — one file,
   * many sessions rendering — so a session's model would be clobbered
   * by whichever session rendered last. This map keeps each session's
   * latest render so readers can tell "one session on Fable, one on
   * Opus" apart from "everything runs Sonnet". Optional because caches
   * written by older tap versions predate it.
   */
  sessions?: Record<string, SessionCapture>;
  /**
   * Prompt-cache effectiveness for the rendering session, straight from
   * Claude Code's own accounting. Nothing else exposes this locally,
   * and it is the one number that explains WHY a session burns tokens:
   * a low hit ratio with repeated rebuilds means the prefix is being
   * invalidated every turn. Null when the payload omitted the block
   * (no requests yet, or an older CLI).
   */
  promptCache: PromptCacheStats | null;
  /**
   * Open PR / MR on the branch the rendering session is on, or null when
   * there is none (or the CLI predates the block). Claude Code resolves
   * this from the forge itself — we cannot, since we make no network
   * call — so it is only available by reading what it already sends us.
   */
  pr: StatuslinePullRequest | null;
  /**
   * The worktree a `--worktree` session is running in, or null for an
   * ordinary session. Present only inside such a session.
   */
  worktree: StatuslineWorktree | null;
  /**
   * Repository identity derived from the origin remote, or null when
   * there is no origin (or the CLI predates the block). Lives under the
   * payload's `workspace` block, flattened here because nothing else in
   * that block is rendered.
   */
  repo: StatuslineRepo | null;
}

/**
 * An open pull request / merge request for the current branch, as the
 * CLI's own footer badge shows it.
 */
export interface StatuslinePullRequest {
  /** PR number, or the GitLab MR iid. */
  number: number;
  /** PR/MR URL, or "" when unreported. */
  url: string;
  /**
   * Review status — "approved", "pending", "changes_requested" and
   * "draft" today.
   *
   * Deliberately a plain string, not a union. The set is owned by Claude
   * Code and grows across releases; a union would make a value added
   * next release a type error here and, worse, tempt a parser into
   * dropping it. An unrecognised state still renders.
   */
  reviewState: string;
  /**
   * Forge flavour. "mr" means a GitLab merge request, which is written
   * `!123` rather than `#123`; "" for a GitHub PR, where the CLI omits
   * the field. Kept as a string for the same reason as `reviewState`.
   */
  kind: string;
}

/** The git worktree a `--worktree` session is running in. */
export interface StatuslineWorktree {
  /** Worktree name/slug, e.g. "my-feature". Never empty. */
  name: string;
  /** Absolute path to the worktree directory, or "" when unreported. */
  path: string;
  /** Branch checked out in the worktree, or "" when unreported. */
  branch: string;
  /** Directory Claude was in before entering the worktree, or "". */
  originalCwd: string;
  /**
   * Branch that was checked out before entering the worktree, or "".
   * This is the fact a worktree session actually raises — "which branch
   * was I on?" — and nothing else on disk still answers it once the
   * session has moved.
   */
  originalBranch: string;
}

/** Repository identity from the origin remote. */
export interface StatuslineRepo {
  /** Forge host, e.g. "github.com". "" when unreported. */
  host: string;
  /** Owner / org / group. Never empty. */
  owner: string;
  /** Repository name. Never empty. */
  name: string;
}

/**
 * Context-window occupancy for the rendering session.
 *
 * `usedPercent` and `size` are what the UI has always shown. `tokens`
 * carries the real counts behind that percentage, which is the only way
 * to say whether a 40%-full window is 80k cheap cache reads or 80k
 * freshly-billed input.
 */
export interface ContextUsage {
  /** Percentage 0-100 of the window consumed. */
  usedPercent: number;
  /** Window size in tokens for the active model, or 0 when unreported. */
  size: number;
  /** Token breakdown, or null before the first API response. */
  tokens: ContextTokens | null;
}

/** Raw token counts behind {@link ContextUsage}. */
export interface ContextTokens {
  /** Input tokens currently in the window, incl. cache reads/writes. */
  totalInput: number;
  /** Output tokens from the most recent response. */
  totalOutput: number;
  /** Input tokens on the last call that were neither cached nor written. */
  input: number;
  /** Output tokens generated by the last call. */
  output: number;
  /** Tokens written to the cache by the last call. */
  cacheCreation: number;
  /** Tokens served from the cache on the last call. */
  cacheRead: number;
}

/** Prompt-cache effectiveness over the rendering session. */
export interface PromptCacheStats {
  /** Fraction 0-1 of requests served from a warm cache. */
  hitRatio: number;
  /** Requests observed in the window. */
  requests: number;
  /** Requests that missed. */
  misses: number;
  /** Prefix rebuilds Claude expects the misses to have cost. */
  expectedRebuilds: number;
  /** Tokens written into the cache. */
  cacheWriteTokens: number;
  /** Tokens re-written purely because a miss invalidated the prefix. */
  missRecacheTokens: number;
  /** Cache TTL in force ("5m" / "1h"), or "" when unreported. */
  ttl: string;
  /**
   * Why the most recent miss happened, or null when none was diagnosed.
   *
   * Claude Code reports this as an OBJECT, not a string — an earlier
   * reader coerced it with a string cast, which silently yielded "" for
   * every payload and left the UI's "Last miss" line permanently blank.
   */
  lastMissCause: PromptCacheMissCause | null;
  /** True while the cache is warm. */
  warm: boolean;
  /**
   * True once any response has reported cache tokens. False means the
   * provider never cached at all, which reads very differently from
   * "cached, but currently cold" — `warm: false` covers both otherwise.
   */
  cachingObserved: boolean;
  /** Epoch SECONDS when the warm prefix goes cold, or 0 when unreported. */
  expiresAt: number;
  /** Epoch SECONDS of the last miss, or 0 when there has been none. */
  lastMissAt: number;
  /**
   * Miss counts per diagnosed cause this session. Same closed set of
   * names as {@link PromptCacheMissCause.causes}. Empty when nothing
   * has been diagnosed.
   */
  missCauses: Record<string, number>;
  /**
   * Tokens the next request re-caches if the prefix is cold by then,
   * or null right after a compaction (Claude cannot yet predict it).
   */
  recacheTokensIfCold: number | null;
}

/**
 * Diagnosis of a single prompt-cache miss.
 *
 * `causes` is a closed set owned by Claude Code — currently names like
 * "system_prompt_changed", "tools_changed", "model_changed",
 * "messages_rewritten", "ttl_expired_5m", "ttl_expired_1h",
 * "likely_server_side", "unknown". We do not enumerate it as a union:
 * the set grows across releases and an unknown name must still render.
 */
export interface PromptCacheMissCause {
  /** One or more cause names. Never empty when this object exists. */
  causes: string[];
  /** Tools added since the cached prefix, when the cause names them. */
  toolsAdded: number;
  /** Tools removed since the cached prefix. */
  toolsRemoved: number;
  /** Net system-prompt character delta, signed. */
  systemCharDelta: number;
}

/** A single rolling rate-limit window. */
export interface RateWindow {
  /** Percentage 0–100 of the window's cap consumed. */
  usedPercent: number;
  /** Epoch SECONDS when the window resets, or 0 when unknown. */
  resetsAt: number;
}

// ── Payload shape (all optional — owned by Claude Code) ──

interface StatuslinePayload {
  version?: unknown;
  session_id?: unknown;
  session_name?: unknown;
  model?: { id?: unknown; display_name?: unknown } | null;
  context_window?: {
    used_percentage?: unknown;
    context_window_size?: unknown;
    total_input_tokens?: unknown;
    total_output_tokens?: unknown;
    current_usage?: {
      input_tokens?: unknown;
      output_tokens?: unknown;
      cache_creation_input_tokens?: unknown;
      cache_read_input_tokens?: unknown;
    } | null;
  } | null;
  cost?: {
    total_cost_usd?: unknown;
    total_duration_ms?: unknown;
    total_lines_added?: unknown;
    total_lines_removed?: unknown;
  } | null;
  rate_limits?: {
    five_hour?: RatePayload | null;
    seven_day?: RatePayload | null;
    spend_limit?: RatePayload | null;
  } | null;
  prompt_cache?: {
    warm?: unknown;
    caching_observed?: unknown;
    ttl?: unknown;
    expires_at?: unknown;
    requests?: unknown;
    misses?: unknown;
    expected_rebuilds?: unknown;
    hit_ratio?: unknown;
    cache_write_tokens?: unknown;
    miss_recache_tokens?: unknown;
    last_miss_at?: unknown;
    last_miss_cause?: unknown;
    miss_causes?: unknown;
    recache_tokens_if_cold?: unknown;
  } | null;
  pr?: {
    number?: unknown;
    url?: unknown;
    review_state?: unknown;
    kind?: unknown;
  } | null;
  worktree?: {
    name?: unknown;
    path?: unknown;
    branch?: unknown;
    original_cwd?: unknown;
    original_branch?: unknown;
  } | null;
  workspace?: {
    repo?: RepoPayload | null;
  } | null;
}

/**
 * The payload's `workspace.repo` block. Its keys are already the ones we
 * persist — no snake_case to translate — so {@link repoOf} serves both
 * the live payload and the revive path.
 */
interface RepoPayload {
  host?: unknown;
  owner?: unknown;
  name?: unknown;
}

interface RatePayload {
  used_percentage?: unknown;
  resets_at?: unknown;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Like {@link num}, but keeps the distinction between "reported as 0"
 * and "not reported". Claude Code uses `null` for fields it genuinely
 * cannot compute yet (e.g. `recache_tokens_if_cold` right after a
 * compaction), and collapsing that to 0 would render a confident zero
 * where the honest answer is "unknown".
 */
function optNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Non-empty strings from an unknown array; [] for anything else. */
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((e): e is string => typeof e === "string" && e.length > 0);
}

/**
 * Coerce Claude's `miss_causes` histogram. Keys are cause names from a
 * set that grows across releases, so unknown keys are kept verbatim —
 * only non-numeric values are dropped.
 */
function missCauseCounts(v: unknown): Record<string, number> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [name, count] of Object.entries(v)) {
    if (typeof count === "number" && Number.isFinite(count)) out[name] = count;
  }
  return out;
}

/**
 * Parse the `last_miss_cause` object.
 *
 * Returns null when the diagnosis is absent OR carries no cause names:
 * an object with an empty `causes` array tells the user nothing, and
 * the UI should fall back to its "no cause diagnosed" phrasing rather
 * than render an empty list.
 */
function missCauseOf(v: unknown): PromptCacheMissCause | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const raw = v as {
    causes?: unknown;
    tools_added?: unknown;
    tools_removed?: unknown;
    system_char_delta?: unknown;
  };
  const causes = strArray(raw.causes);
  if (causes.length === 0) return null;
  return {
    causes,
    toolsAdded: num(raw.tools_added),
    toolsRemoved: num(raw.tools_removed),
    systemCharDelta: num(raw.system_char_delta),
  };
}

function window(raw: RatePayload | null | undefined): RateWindow | null {
  if (!raw || typeof raw.used_percentage !== "number") return null;
  return { usedPercent: num(raw.used_percentage), resetsAt: num(raw.resets_at) };
}

function promptCacheOf(
  raw: StatuslinePayload["prompt_cache"],
): PromptCacheStats | null {
  // `requests` is the block's own liveness signal — Claude Code omits
  // the whole block until at least one request has been observed.
  if (!raw || typeof raw.requests !== "number") return null;
  return {
    hitRatio: num(raw.hit_ratio),
    requests: num(raw.requests),
    misses: num(raw.misses),
    expectedRebuilds: num(raw.expected_rebuilds),
    cacheWriteTokens: num(raw.cache_write_tokens),
    missRecacheTokens: num(raw.miss_recache_tokens),
    ttl: str(raw.ttl),
    lastMissCause: missCauseOf(raw.last_miss_cause),
    warm: raw.warm === true,
    cachingObserved: raw.caching_observed === true,
    expiresAt: num(raw.expires_at),
    lastMissAt: num(raw.last_miss_at),
    missCauses: missCauseCounts(raw.miss_causes),
    recacheTokensIfCold: optNum(raw.recache_tokens_if_cold),
  };
}

/**
 * Build {@link ContextUsage} from the payload's `context_window` block.
 *
 * `used_percentage` is the block's liveness signal: Claude reports it as
 * null until the first API response, and without it there is nothing to
 * show. `current_usage` is independently nullable for the same reason,
 * so the token breakdown stays optional inside a present context block.
 */
function contextOf(
  raw: StatuslinePayload["context_window"],
): ContextUsage | null {
  if (!raw || typeof raw.used_percentage !== "number") return null;
  const cur = raw.current_usage;
  return {
    usedPercent: num(raw.used_percentage),
    size: num(raw.context_window_size),
    tokens: cur
      ? {
          totalInput: num(raw.total_input_tokens),
          totalOutput: num(raw.total_output_tokens),
          input: num(cur.input_tokens),
          output: num(cur.output_tokens),
          cacheCreation: num(cur.cache_creation_input_tokens),
          cacheRead: num(cur.cache_read_input_tokens),
        }
      : null,
  };
}

/**
 * Parse the payload's `pr` block.
 *
 * `number` is both the block's liveness signal and the only thing the
 * link can be labelled with, so a non-numeric value (the string "123",
 * say) rejects the whole block rather than being coerced — "#NaN" or
 * "#undefined" would be worse than showing nothing. Everything else is
 * independently optional: a PR with no review yet has no `review_state`,
 * and GitHub PRs carry no `kind` at all.
 */
function prOf(raw: StatuslinePayload["pr"]): StatuslinePullRequest | null {
  if (!raw || typeof raw.number !== "number" || !Number.isFinite(raw.number)) {
    return null;
  }
  return {
    number: raw.number,
    url: str(raw.url),
    reviewState: str(raw.review_state),
    kind: str(raw.kind),
  };
}

/**
 * Parse the payload's `worktree` block.
 *
 * `name` is the worktree's label and its liveness signal — a path with
 * no name reads as an unrelated directory, which is worse than silence.
 * `branch` and `original_branch` are optional in the CLI's own schema.
 */
function worktreeOf(
  raw: StatuslinePayload["worktree"],
): StatuslineWorktree | null {
  if (!raw || typeof raw.name !== "string" || raw.name.length === 0) return null;
  return {
    name: raw.name,
    path: str(raw.path),
    branch: str(raw.branch),
    originalCwd: str(raw.original_cwd),
    originalBranch: str(raw.original_branch),
  };
}

/**
 * Parse a `workspace.repo` block.
 *
 * `owner` and `name` are required together: the rendered form is
 * "owner/name", and half of that is a dangling slash. `host` is
 * genuinely optional and stays "" when unreported.
 *
 * Also used by {@link reviveCache} — this block's persisted keys are
 * identical to its payload keys, so one function covers both.
 */
function repoOf(raw: unknown): StatuslineRepo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { host, owner, name } = raw as RepoPayload;
  const ownerStr = str(owner);
  const nameStr = str(name);
  if (!ownerStr || !nameStr) return null;
  return { host: str(host), owner: ownerStr, name: nameStr };
}

/**
 * Parse a raw statusline payload string into a `StatuslineCache`.
 * Returns null only when the input isn't valid JSON — a valid payload
 * missing every field still yields a cache (with nulls) so the caller
 * can record "Claude ran but reported nothing yet".
 *
 * `now` is injected (not read from a clock) so this stays pure and the
 * captured timestamp is testable.
 */
export function extractCache(raw: string, now: number): StatuslineCache | null {
  let payload: StatuslinePayload;
  try {
    payload = JSON.parse(raw) as StatuslinePayload;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;

  const model = payload.model;
  const ctx = payload.context_window;
  const cost = payload.cost;
  const rl = payload.rate_limits;

  const modelCapture =
    model && (model.id != null || model.display_name != null)
      ? { id: str(model.id), displayName: str(model.display_name) }
      : null;
  const sessionId = str(payload.session_id);
  const sessionCapture: SessionCapture = { model: modelCapture, capturedAt: now };
  // Per-session cost and context, so a multi-session cache can report
  // real spend per session instead of only the last writer's.
  if (cost && typeof cost.total_cost_usd === "number") {
    sessionCapture.costUsd = num(cost.total_cost_usd);
  }
  if (ctx && typeof ctx.used_percentage === "number") {
    sessionCapture.contextPercent = num(ctx.used_percentage);
  }

  return {
    capturedAt: now,
    version: str(payload.version),
    sessionName: str(payload.session_name),
    model: modelCapture,
    sessions: sessionId ? { [sessionId]: sessionCapture } : {},
    promptCache: promptCacheOf(payload.prompt_cache),
    pr: prOf(payload.pr),
    worktree: worktreeOf(payload.worktree),
    repo: repoOf(payload.workspace?.repo),
    context: contextOf(ctx),
    cost:
      cost && typeof cost.total_cost_usd === "number"
        ? {
            totalUsd: num(cost.total_cost_usd),
            durationMs: num(cost.total_duration_ms),
            linesAdded: num(cost.total_lines_added),
            linesRemoved: num(cost.total_lines_removed),
          }
        : null,
    rateLimits: {
      fiveHour: window(rl?.five_hour),
      sevenDay: window(rl?.seven_day),
      spendLimit: window(rl?.spend_limit),
    },
  };
}

/**
 * Normalise a cache object read back from disk.
 *
 * The cache file is written by the tap and read by the extension host,
 * and the two can be different versions: a user upgrades the extension
 * while an older tap script is still installed, or the file predates a
 * field we now depend on. Every reader funnels through here so that
 * shape drift is handled in ONE place rather than with defensive
 * fallbacks scattered across the consumers.
 *
 * The one field that changed TYPE rather than merely appearing is
 * `promptCache.lastMissCause`: caches written before this revision hold
 * the string `""` where the current shape expects an object or null.
 */
export function reviveCache(value: unknown): StatuslineCache | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<StatuslineCache> & {
    promptCache?: unknown;
    rateLimits?: Partial<StatuslineCache["rateLimits"]>;
    context?: unknown;
  };
  return {
    capturedAt: num(raw.capturedAt),
    version: str(raw.version),
    sessionName: str(raw.sessionName),
    model: raw.model ?? null,
    sessions: raw.sessions ?? {},
    context: reviveContext(raw.context),
    cost: raw.cost ?? null,
    rateLimits: {
      fiveHour: raw.rateLimits?.fiveHour ?? null,
      sevenDay: raw.rateLimits?.sevenDay ?? null,
      spendLimit: raw.rateLimits?.spendLimit ?? null,
    },
    promptCache: revivePromptCache(raw.promptCache),
    pr: revivePr(raw.pr),
    worktree: reviveWorktree(raw.worktree),
    repo: repoOf(raw.repo),
  };
}

/** Back-fill a persisted `pr` block; null for caches that predate it. */
function revivePr(value: unknown): StatuslinePullRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<StatuslinePullRequest>;
  if (typeof raw.number !== "number" || !Number.isFinite(raw.number)) return null;
  return {
    number: raw.number,
    url: str(raw.url),
    reviewState: str(raw.reviewState),
    kind: str(raw.kind),
  };
}

/** Back-fill a persisted `worktree` block; null for caches that predate it. */
function reviveWorktree(value: unknown): StatuslineWorktree | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<StatuslineWorktree>;
  if (typeof raw.name !== "string" || raw.name.length === 0) return null;
  return {
    name: raw.name,
    path: str(raw.path),
    branch: str(raw.branch),
    originalCwd: str(raw.originalCwd),
    originalBranch: str(raw.originalBranch),
  };
}

/** Back-fill a persisted context block that predates `tokens`. */
function reviveContext(value: unknown): ContextUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<ContextUsage>;
  if (typeof raw.usedPercent !== "number") return null;
  return {
    usedPercent: raw.usedPercent,
    size: num(raw.size),
    tokens: raw.tokens ?? null,
  };
}

/** Back-fill a persisted prompt-cache block, including the legacy
 *  string-valued `lastMissCause` written by taps before this revision. */
function revivePromptCache(value: unknown): PromptCacheStats | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<PromptCacheStats> & { lastMissCause?: unknown };
  if (typeof raw.requests !== "number") return null;
  return {
    hitRatio: num(raw.hitRatio),
    requests: raw.requests,
    misses: num(raw.misses),
    expectedRebuilds: num(raw.expectedRebuilds),
    cacheWriteTokens: num(raw.cacheWriteTokens),
    missRecacheTokens: num(raw.missRecacheTokens),
    ttl: str(raw.ttl),
    // A legacy string here is discarded, not coerced: the old value was
    // always "" anyway, so there is no information to preserve.
    lastMissCause: missCauseOf(raw.lastMissCause),
    warm: raw.warm === true,
    cachingObserved: raw.cachingObserved === true,
    expiresAt: num(raw.expiresAt),
    lastMissAt: num(raw.lastMissAt),
    missCauses: missCauseCounts(raw.missCauses),
    recacheTokensIfCold: optNum(raw.recacheTokensIfCold),
  };
}

/** Keep a session capture visible for this long after its last render. */
export const SESSION_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
/** Cap on retained session captures — newest win. */
export const SESSION_CAPTURE_MAX = 20;
/** A capture younger than this counts as "running right now". */
export const SESSION_FRESH_MS = 15 * 60 * 1000;

/**
 * Merge a fresh render into the previously persisted cache. Top-level
 * fields come from the fresh render (latest wins — matches the old
 * single-slot behaviour); the `sessions` map is the union, pruned to
 * captures younger than the TTL and capped at the newest
 * SESSION_CAPTURE_MAX entries. Pure so the tap and tests share it.
 */
export function mergeCaches(
  prev: StatuslineCache | null,
  fresh: StatuslineCache,
  now: number,
): StatuslineCache {
  const merged: Record<string, SessionCapture> = {
    ...(prev?.sessions ?? {}),
    ...(fresh.sessions ?? {}),
  };
  const kept = Object.entries(merged)
    .filter(([, c]) => now - c.capturedAt < SESSION_CAPTURE_TTL_MS)
    .sort((a, b) => b[1].capturedAt - a[1].capturedAt)
    .slice(0, SESSION_CAPTURE_MAX);
  return { ...fresh, sessions: Object.fromEntries(kept) };
}

/**
 * Model name the "Default (…)" label may honestly claim, or null when
 * no honest claim exists.
 *
 *   - Exactly one distinct model across freshly-rendered sessions →
 *     that model (it's what the user is getting right now).
 *   - Two or more distinct fresh models (concurrent sessions on
 *     different models — per-session overrides in play) → null. The
 *     last writer's model would be a coin flip, so claim nothing.
 *   - No fresh session → fall back to the last-known top-level model,
 *     matching the old behaviour for the idle case.
 */
export function resolveActiveModel(
  cache: StatuslineCache | null,
  now: number,
): string | null {
  if (!cache) return null;
  const fresh = Object.values(cache.sessions ?? {}).filter(
    (c) => now - c.capturedAt < SESSION_FRESH_MS && c.model?.displayName,
  );
  const names = new Set(fresh.map((c) => c.model!.displayName));
  if (names.size === 1) return [...names][0];
  if (names.size > 1) return null;
  return cache.model?.displayName || null;
}

/**
 * Compact one-line status rendered by the tap when the user has NO
 * existing statusline to chain — so installing the tap leaves them with
 * a useful bar rather than a blank one. Shows whatever the payload
 * provided; omits any segment whose data is missing.
 */
export function renderDefaultLine(cache: StatuslineCache): string {
  const parts: string[] = [];
  if (cache.model && cache.model.displayName) parts.push(cache.model.displayName);
  if (cache.context) parts.push(`ctx ${Math.round(cache.context.usedPercent)}%`);
  const r = cache.rateLimits;
  if (r.fiveHour) parts.push(`5h ${Math.round(r.fiveHour.usedPercent)}%`);
  if (r.sevenDay) parts.push(`7d ${Math.round(r.sevenDay.usedPercent)}%`);
  return parts.join("  ·  ");
}
