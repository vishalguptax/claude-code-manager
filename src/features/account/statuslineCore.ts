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
}

/** Normalised subset of the statusline payload we persist + render. */
export interface StatuslineCache {
  /** Epoch ms when the tap captured this (NOT from the payload). */
  capturedAt: number;
  /** Claude Code version string, e.g. "2.1.86". Empty when absent. */
  version: string;
  /** Active model, or null when the payload omitted it. */
  model: { id: string; displayName: string } | null;
  /** Context-window usage for the current session, or null. */
  context: { usedPercent: number; size: number } | null;
  /** Current-session cost + edit counters, or null. */
  cost: {
    totalUsd: number;
    durationMs: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  /** Rolling rate-limit windows. Either side is null when absent. */
  rateLimits: {
    fiveHour: RateWindow | null;
    sevenDay: RateWindow | null;
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
  model?: { id?: unknown; display_name?: unknown } | null;
  context_window?: {
    used_percentage?: unknown;
    context_window_size?: unknown;
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
  } | null;
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

function window(raw: RatePayload | null | undefined): RateWindow | null {
  if (!raw || typeof raw.used_percentage !== "number") return null;
  return { usedPercent: num(raw.used_percentage), resetsAt: num(raw.resets_at) };
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

  return {
    capturedAt: now,
    version: str(payload.version),
    model: modelCapture,
    sessions: sessionId
      ? { [sessionId]: { model: modelCapture, capturedAt: now } }
      : {},
    context:
      ctx && typeof ctx.used_percentage === "number"
        ? {
            usedPercent: num(ctx.used_percentage),
            size: num(ctx.context_window_size),
          }
        : null,
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
    },
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
