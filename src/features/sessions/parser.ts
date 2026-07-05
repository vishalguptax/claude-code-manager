/**
 * Session parsing — public facade.
 *
 * The implementation is split across focused modules so no single file
 * carries the whole ~1500-line surface:
 *
 * - `metaParser`    — the session-file index + bounded head/tail metadata
 *   reads (branch, entrypoint, rename, summary, ai-title), LRU-cached.
 * - `liveSessions`  — PID-file liveness, the `awaiting_question` refinement,
 *   and `applyLiveState` (LRU-capped pending-question probe).
 * - `historyParser` — full Session list reconstruction from history.jsonl +
 *   orphan transcripts; targeted single-session reparse.
 * - `detailParser`  — single-transcript detail paging / search.
 * - `grouping`      — pure list shaping (group / stats / search / filter).
 *
 * This barrel re-exports the stable surface so consumers (`viewProvider`,
 * `commands`, tests) keep importing from `./parser`. Splitting the
 * implementation is a pure refactor — no behaviour change.
 */
export {
  getSessionFile,
  invalidateSessionMetaCache,
  clearMetaCaches,
} from "./metaParser";

export {
  AWAITING_QUESTION_STATUS,
  applyLiveState,
  readLiveSessions,
  clearPendingCache,
} from "./liveSessions";
export type { LiveSessionInfo } from "./liveSessions";

export {
  getLastParseWarning,
  parseSessions,
  reparseOneSession,
  reparseSessionsBatch,
  clearOrphanCache,
} from "./historyParser";

export { parseSessionDetail } from "./detailParser";

export {
  filterSessions,
  getStats,
  getUniqueProjects,
  groupSessions,
  searchSessions,
} from "./grouping";
