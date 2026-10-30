/**
 * Removing a session's data from disk.
 *
 * Claude Code has no per-session delete: `claude rm` covers background
 * sessions only, and `claude purge` removes a whole project. What purge
 * removes for each session of that project is what this removes for one
 * session: its transcript (`projects/<slug>/<id>.jsonl`) and the folder
 * beside it (subagent transcripts, tool results), its file-edit history
 * (`file-history/<id>`), and its rows in `history.jsonl`. `session-env/<id>`
 * belongs to the session alone and goes with it.
 *
 * Plain Node, no vscode — the host confirms and refuses running sessions.
 */
import * as fs from "fs";
import * as path from "path";
import {
  FILE_HISTORY_DIR,
  HISTORY_FILE,
  PROJECTS_DIR,
  SESSION_ENV_DIR,
} from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";

/**
 * Session ids become path segments, so only a real id's shape is accepted —
 * a crafted id must not be able to name anything outside these folders.
 */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionDeleteResult {
  deleted: string[];
  failed: Array<{ sessionId: string; error: string }>;
  /** Why the deleted sessions' history.jsonl rows (their typed prompts) remain. */
  historyError?: string;
}

/**
 * Strip every history.jsonl line whose `sessionId` is in `ids`.
 * Done as a single read + filter + atomic rename so a partial write
 * cannot leave history.jsonl truncated. If history.jsonl doesn't
 * exist (the user has never run Claude before, or just deleted it),
 * silently skip.
 */
export function stripHistoryLines(ids: string[]): void {
  if (ids.length === 0) return;
  let raw: string;
  try {
    raw = fs.readFileSync(HISTORY_FILE, "utf-8");
  } catch {
    return;
  }
  const target = new Set(ids);
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as { sessionId?: string };
      if (obj.sessionId && target.has(obj.sessionId)) continue;
    } catch {
      // Malformed line — keep it. We are not in the business of
      // silently editing user data we don't understand.
    }
    kept.push(line);
  }
  writeFileAtomic(HISTORY_FILE, kept.length > 0 ? kept.join("\n") + "\n" : "");
}

/**
 * Every path holding the session's data, transcript last. A session's
 * transcript may sit under more than one project folder (a resume from
 * another directory), so every project folder is checked.
 */
function sessionPaths(sessionId: string): string[] {
  const extras = [path.join(FILE_HISTORY_DIR, sessionId), path.join(SESSION_ENV_DIR, sessionId)];
  const transcripts: string[] = [];
  let projects: string[] = [];
  try {
    projects = fs.readdirSync(PROJECTS_DIR);
  } catch {
    // No projects folder — nothing of the session's lives there.
  }
  for (const project of projects) {
    extras.push(path.join(PROJECTS_DIR, project, sessionId));
    transcripts.push(path.join(PROJECTS_DIR, project, `${sessionId}.jsonl`));
  }
  return [...extras, ...transcripts];
}

/**
 * Delete sessions' data. Per session, the transcript goes last: if anything
 * before it fails, the session stays listed and the delete can be retried.
 * A symlink is removed, never followed. History rows are stripped once, for
 * the sessions that were deleted.
 */
export function deleteSessionFiles(sessionIds: readonly string[]): SessionDeleteResult {
  const result: SessionDeleteResult = { deleted: [], failed: [] };
  for (const sessionId of sessionIds) {
    if (!SESSION_ID.test(sessionId)) {
      result.failed.push({ sessionId, error: "not a session id" });
      continue;
    }
    try {
      for (const p of sessionPaths(sessionId)) fs.rmSync(p, { recursive: true, force: true });
      result.deleted.push(sessionId);
    } catch (err) {
      result.failed.push({ sessionId, error: (err as Error).message });
    }
  }
  try {
    stripHistoryLines(result.deleted);
  } catch (err) {
    result.historyError = (err as Error).message;
  }
  return result;
}
