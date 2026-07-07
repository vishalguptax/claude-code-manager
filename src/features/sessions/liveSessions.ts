/**
 * Live-session state derived from PID files under ~/.claude/sessions/.
 *
 * The CLI heartbeats a `<pid>.json` file per running session. This module
 * turns those into per-session liveness signals and the synthetic
 * `awaiting_question` status (an idle session blocked on an interactive
 * tool the user must answer). Kept separate from history reconstruction so
 * the high-frequency live-refresh path doesn't drag in the heavier parse.
 *
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { SESSIONS_DIR } from "../../core/config";
import { LRU } from "../../core/lru";
import { getSessionFile } from "./metaParser";
import { getProcessStartTimes } from "./procTime";
import type { Session } from "./types";

/**
 * Upper bound on the pending-question probe cache so it cannot grow
 * without limit across thousands of distinct transcripts.
 */
const PENDING_CACHE_MAX = 2000;

/**
 * Allowed gap between the OS-reported process start time and the `startedAt`
 * the CLI recorded before we call it the same process. `startedAt` is stamped
 * a moment after the fork (node boot + CLI init), so a few seconds of slack is
 * expected; 60s comfortably absorbs that and clock jitter while making a
 * recycled PID — a different process that happens to have started within a
 * minute of the orphan's exact start — effectively impossible.
 */
const PROC_START_TOLERANCE_MS = 60_000;

/**
 * Probe whether a process id is still running. `process.kill(pid, 0)` is
 * the standard no-op liveness check — on Windows it works the same as on
 * POSIX, and a permission error (EPERM) still proves the process exists.
 */
function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Per-session liveness signal derived from a PID file under
 * `~/.claude/sessions/`. Captures the CLI-reported status string and
 * heartbeat timestamp so the webview can render multi-state indicators
 * (busy / idle / awaiting permission / …) without re-reading the file.
 *
 * `status` is passed through verbatim from the PID JSON so the UI is
 * forward-compatible with new CLI states without a code change here.
 */
export interface LiveSessionInfo {
  pid: number;
  status: string;
  /** Heartbeat timestamp (ms epoch) recorded by the CLI, or 0 if absent. */
  updatedAt: number;
}

/**
 * Scan PID-named files in `~/.claude/sessions/` and return:
 *   - `names`: sessionId -> user-set display name (subset that carry `name`)
 *   - `live`:  sessionId -> LiveSessionInfo for sessions whose recorded
 *              PID still names a running process
 *
 * Combined so both reads happen in a single directory walk. The CLI leaves
 * these files behind on hard exits, so the PID liveness check is what
 * distinguishes a session that's actually running from a stale shell.
 *
 * When multiple PID files reference the same sessionId (CLI restart that
 * didn't sweep the prior file), the entry with the most recent `updatedAt`
 * whose process is still alive wins so the freshest signal drives the UI.
 */
export function readSessionsDir(): {
  names: Map<string, string>;
  live: Map<string, LiveSessionInfo>;
} {
  const names = new Map<string, string>();
  const live = new Map<string, LiveSessionInfo>();
  let files: string[];
  try {
    files = fs.readdirSync(SESSIONS_DIR);
  } catch {
    return { names, live };
  }

  interface Candidate extends LiveSessionInfo {
    sessionId: string;
    /** CLI-recorded start time (unix ms), or null when the file omits it. */
    startedAt: number | null;
  }
  const candidates: Candidate[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
      if (!sessionId) continue;
      if (typeof data.name === "string") names.set(sessionId, data.name);
      if (typeof data.pid !== "number" || !isPidAlive(data.pid)) continue;
      candidates.push({
        sessionId,
        pid: data.pid,
        status: typeof data.status === "string" ? data.status : "",
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
        startedAt: typeof data.startedAt === "number" ? data.startedAt : null,
      });
    } catch {
      // Skip unreadable files (partial writes during CLI heartbeat,
      // permission errors, schema drift)
    }
  }

  // Defeat PID reuse: `isPidAlive` above only proves *some* process owns the
  // PID now. An orphaned PID file (hard-killed CLI) can point at a recycled
  // PID owned by an unrelated process. Compare the OS process start time
  // against the CLI-recorded `startedAt`; a mismatch beyond tolerance means
  // the PID was reused, so the session is not live. Only query for candidates
  // that carry a `startedAt` — the others we cannot disambiguate, and we trust
  // the liveness check for them rather than risk dropping a real session.
  const checkable = candidates.filter((c) => c.startedAt !== null);
  const osStarts = checkable.length
    ? getProcessStartTimes(checkable.map((c) => c.pid))
    : new Map<number, number>();

  for (const c of candidates) {
    if (c.startedAt !== null) {
      const osStart = osStarts.get(c.pid);
      // Only drop when we positively know the OS start time and it disagrees;
      // an unknown start time (query failed / unsupported OS) falls through to
      // trusting liveness so we never hide a session we cannot verify.
      if (osStart !== undefined && Math.abs(osStart - c.startedAt) > PROC_START_TOLERANCE_MS) {
        continue;
      }
    }
    const next: LiveSessionInfo = { pid: c.pid, status: c.status, updatedAt: c.updatedAt };
    const prev = live.get(c.sessionId);
    if (!prev || next.updatedAt >= prev.updatedAt) live.set(c.sessionId, next);
  }

  return { names, live };
}

/**
 * Public liveness probe. Exported so the view provider can refresh the
 * `isLive` / `status` fields on its cached session list without redoing
 * a full transcript parse — the watcher fires very frequently while
 * Claude is generating, and a full reparse on every tick would re-stream
 * megabytes of orphan transcripts.
 */
export function readLiveSessions(): Map<string, LiveSessionInfo> {
  return readSessionsDir().live;
}

/**
 * Synthetic status emitted when Claude is blocked on an interactive
 * tool the user must answer (currently `AskUserQuestion` and
 * `ExitPlanMode`). The CLI itself only reports `idle` in this case
 * because, from its point of view, the process is waiting for input
 * either way — but the user needs to know which idle sessions need
 * their attention. The webview maps this string to the same orange
 * variant used for `awaiting_permission`.
 */
export const AWAITING_QUESTION_STATUS = "awaiting_question";

/**
 * Set of assistant tool names whose `tool_use` blocks block the
 * session until the user answers. Detected by tailing the transcript
 * and looking for the most recent `tool_use` of these tools without a
 * matching `tool_result`.
 */
const PENDING_USER_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);

/**
 * Bytes of session-file tail scanned for the pending-interaction
 * probe. 32 KB easily covers the last several assistant turns even
 * when individual messages carry large code blocks, while keeping the
 * per-tick read cost bounded.
 */
const PENDING_TAIL_READ_BYTES = 32 * 1024;

/**
 * LRU mtime cache for the pending-question probe. The probe rereads the
 * file tail only when the transcript actually changes; an unchanged
 * file returns the cached boolean immediately so the live-state
 * refresh tick stays sub-millisecond per session. Capped so it cannot
 * grow without bound.
 */
const pendingCache = new LRU<string, { mtimeMs: number; pending: boolean }>(PENDING_CACHE_MAX);

/** Drop the pending-question cache entry for one transcript. */
export function invalidatePendingCacheEntry(filePath: string): void {
  pendingCache.delete(filePath);
}

/** Drop every pending-question cache entry. Used by the global reload. */
export function clearPendingCache(): void {
  pendingCache.clear();
}

/**
 * Tail-scan a session transcript and return true when Claude is
 * currently blocked on a question the user must answer. "Blocked"
 * means: the most recent `tool_use` block whose tool is in
 * `PENDING_USER_TOOLS` has no matching `tool_result` block later in
 * the transcript.
 *
 * Tail-only by design: the answer can only flip on the very last
 * message exchange, so we read at most `PENDING_TAIL_READ_BYTES`.
 * mtime cache means we don't re-tail untouched files on every refresh.
 */
function detectPendingInteraction(filePath: string): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  const cached = pendingCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.pending;

  let text: string;
  try {
    const start = Math.max(0, stat.size - PENDING_TAIL_READ_BYTES);
    const length = stat.size - start;
    const buf = Buffer.alloc(length);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buf, 0, length, start);
    } finally {
      fs.closeSync(fd);
    }
    text = buf.toString("utf-8");
  } catch {
    pendingCache.set(filePath, { mtimeMs: stat.mtimeMs, pending: false });
    return false;
  }

  // Single forward pass: add ids on tool_use, remove on tool_result.
  // Anything still in the set at the end is unanswered. The tail may
  // start mid-line, so skip the first partial line — its loss can at
  // most produce a false negative for a tool_use that lived right at
  // the boundary, which the next refresh tick will catch once the
  // file grows another line.
  const lines = text.split("\n");
  if (text[0] !== "{" && lines.length > 1) lines.shift();
  const pendingIds = new Set<string>();
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: { message?: { content?: unknown } };
    try {
      entry = JSON.parse(line) as { message?: { content?: unknown } };
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as Array<Record<string, unknown>>) {
      if (
        block?.type === "tool_use" &&
        typeof block.name === "string" &&
        typeof block.id === "string" &&
        PENDING_USER_TOOLS.has(block.name)
      ) {
        pendingIds.add(block.id);
      } else if (
        block?.type === "tool_result" &&
        typeof block.tool_use_id === "string"
      ) {
        pendingIds.delete(block.tool_use_id);
      }
    }
  }

  const pending = pendingIds.size > 0;
  pendingCache.set(filePath, { mtimeMs: stat.mtimeMs, pending });
  return pending;
}

/**
 * Surface the synthetic `awaiting_question` state whenever the transcript
 * shows an unanswered interactive tool_use (`AskUserQuestion`/`ExitPlanMode`).
 *
 * The probe runs regardless of the PID file's `status`. The CLI only rewrites
 * `status` on a *change* and routinely leaves it frozen at `busy` while the
 * session is actually blocked on the user — so gating the probe on `idle`
 * (as before) left a pending question showing the green "busy" dot instead of
 * the orange "needs you" dot. Only these two tools block on the user, so a
 * genuinely active generation (Read/Bash/etc.) never trips this — meaning an
 * unanswered question is definitive proof Claude is waiting, and it correctly
 * overrides a stale `busy`.
 *
 * When no question is pending the base status passes through unchanged, so
 * `busy`, `idle`, and the CLI's own `awaiting_permission` keep their meaning.
 */
export function refineStatus(
  sessionId: string,
  baseStatus: string | undefined,
): string | undefined {
  const file = getSessionFile(sessionId);
  if (file && detectPendingInteraction(file)) return AWAITING_QUESTION_STATUS;
  return baseStatus;
}

/**
 * Mutate `sessions` in place to reflect a freshly read live map.
 * Returns true when at least one session's liveness, status, or
 * heartbeat shifted — callers use this to decide whether to push a
 * new snapshot to the webview (no-op refreshes don't churn the UI).
 *
 * Sessions absent from the live map have their fields cleared so a
 * session that just exited drops back to "not live" without a stale
 * status hanging around.
 */
export function applyLiveState(
  sessions: Session[],
  live: Map<string, LiveSessionInfo>,
): boolean {
  let changed = false;
  for (const s of sessions) {
    const info = live.get(s.id);
    const nextIsLive = info !== undefined;
    const nextStatus = nextIsLive ? refineStatus(s.id, info?.status) : undefined;
    const nextUpdatedAt = info?.updatedAt ?? undefined;
    // Only a change to a field the UI actually renders (isLive / status) forces
    // a re-push. The CLI heartbeats every few seconds, bumping `updatedAt`
    // without changing liveness or status; treating that as "changed" made
    // refreshLiveState re-serialize + re-push the ENTIRE grouped session tree
    // on every heartbeat. `liveUpdatedAt` has no reader, so keep it current
    // but do not let it, alone, trigger a push.
    if (Boolean(s.isLive) !== nextIsLive || s.status !== nextStatus) {
      s.isLive = nextIsLive;
      s.status = nextStatus;
      s.liveUpdatedAt = nextUpdatedAt;
      changed = true;
    } else if (s.liveUpdatedAt !== nextUpdatedAt) {
      s.liveUpdatedAt = nextUpdatedAt;
    }
  }
  return changed;
}
