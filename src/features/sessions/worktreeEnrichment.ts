/**
 * Worktree enrichment for the session list — extension host only.
 *
 * The session list must paint instantly, but resolving git worktrees spawns
 * synchronous `git` processes (a `rev-parse` pair per distinct directory). So
 * enrichment is deferred with setImmediate: the `sessions` message ships and
 * the webview renders first, then the `worktrees` map lands and fills in the
 * worktree badges + repo grouping. Git failures are non-exceptional here —
 * resolveWorktrees simply omits directories that are not inside a repo.
 *
 * The join key is `session.projectPath` (Claude records the session's working
 * directory there — the worktree checkout for worktree sessions), fanned back
 * out to every session id sharing that directory.
 */
import type * as vscode from "vscode";
import {
  resolveWorktrees,
  resolveMissingClaudeWorktree,
  type WorktreeRef,
} from "../../extension/worktrees";
import { normPath } from "../../core/utils";
import type { Session } from "./types";

/**
 * Build the sessionId → WorktreeRef map for a list of sessions. Distinct
 * projectPaths are resolved once (resolveWorktrees dedupes internally), then
 * fanned back out to every session whose directory resolved to a worktree.
 * Sessions not inside a git repo are omitted — the webview groups those by
 * project path as before.
 *
 * A session whose directory does not resolve gets a second chance via
 * {@link resolveMissingClaudeWorktree}: a Claude worktree that was removed from
 * disk still surfaces (with `exists: false`) so the detail view can offer to
 * recreate it. That path is memoized per directory so repeated missing dirs
 * cost one git probe.
 */
export function buildWorktreeMap(sessions: Session[]): Record<string, WorktreeRef> {
  const dirs = sessions
    .map((s) => s.projectPath)
    .filter((p): p is string => Boolean(p));
  const byDir = resolveWorktrees(dirs);
  const missCache = new Map<string, WorktreeRef | null>();
  const map: Record<string, WorktreeRef> = {};
  for (const s of sessions) {
    if (!s.projectPath) continue;
    let ref = byDir.get(s.projectPath);
    if (!ref) {
      // Directory git couldn't resolve — probe for a removed Claude worktree.
      const key = normPath(s.projectPath);
      let miss = missCache.get(key);
      if (miss === undefined) {
        miss = resolveMissingClaudeWorktree(s.projectPath, s.branch);
        missCache.set(key, miss);
      }
      ref = miss ?? undefined;
    }
    if (ref) map[s.id] = ref;
  }
  return map;
}

/**
 * Resolve worktrees for `sessions` and post the `worktrees` message, deferred
 * off the current tick so the preceding `sessions` post renders first. A no-op
 * when nothing resolves — no repos in view means no worktree badges to draw,
 * so the empty message is skipped.
 */
export function postWorktrees(wv: vscode.Webview, sessions: Session[]): void {
  setImmediate(() => {
    const map = buildWorktreeMap(sessions);
    if (Object.keys(map).length === 0) return;
    wv.postMessage({ type: "worktrees", map });
  });
}
