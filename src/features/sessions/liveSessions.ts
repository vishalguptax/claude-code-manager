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
import type { Session } from "./types";

/**
 * Upper bound on the pending-question probe cache so it cannot grow
 * without limit across thousands of distinct transcripts.
 */
const PENDING_CACHE_MAX = 2000;

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

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const sessionId = typeof data.sessionId === "string" ? data.sessionId : "";
      if (!sessionId) continue;
      if (typeof data.name === "string") names.set(sessionId, data.name);
      if (typeof data.pid !== "number" || !isPidAlive(data.pid)) continue;
      const status = typeof data.status === "string" ? data.status : "";
      const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
      const next: LiveSessionInfo = { pid: data.pid, status, updatedAt };
      const prev = live.get(sessionId);
      if (!prev || next.updatedAt >= prev.updatedAt) live.set(sessionId, next);
    } catch {
      // Skip unreadable files (partial writes during CLI heartbeat,
      // permission errors, schema drift)
    }
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
 * Promote `idle` (or no-status) live sessions to the synthetic
 * `awaiting_question` state when their transcript shows an unanswered
 * interactive tool_use. Other statuses are returned unchanged because
 * the CLI is already signalling something more specific (busy,
 * awaiting_permission, …) that we should not stomp on.
 */
export function refineStatus(
  sessionId: string,
  baseStatus: string | undefined,
): string | undefined {
  if (baseStatus !== "idle" && baseStatus !== "" && baseStatus !== undefined) {
    return baseStatus;
  }
  const file = getSessionFile(sessionId);
  if (!file) return baseStatus;
  return detectPendingInteraction(file) ? AWAITING_QUESTION_STATUS : baseStatus;
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
    if (
      Boolean(s.isLive) !== nextIsLive ||
      s.status !== nextStatus ||
      s.liveUpdatedAt !== nextUpdatedAt
    ) {
      s.isLive = nextIsLive;
      s.status = nextStatus;
      s.liveUpdatedAt = nextUpdatedAt;
      changed = true;
    }
  }
  return changed;
}
