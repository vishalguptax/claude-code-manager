/**
 * Session state persistence — pin / delete / archive / read-mark
 * operations on disk. Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import { STATE_FILE } from "../../core/config";
import type { UserState } from "../../core/types";

/**
 * Load the persisted user state (pinned/deleted session IDs) from disk.
 * Returns a default empty state if the file does not exist or is malformed.
 */
export function loadState(): UserState {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const data: unknown = JSON.parse(raw);
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      const rawRenames = obj.renames;
      const renames: Record<string, string> = {};
      if (typeof rawRenames === "object" && rawRenames !== null) {
        for (const [k, v] of Object.entries(rawRenames)) {
          if (typeof v === "string") renames[k] = v;
        }
      }
      const rawReadAt = obj.readAt;
      const readAt: Record<string, number> = {};
      if (typeof rawReadAt === "object" && rawReadAt !== null) {
        for (const [k, v] of Object.entries(rawReadAt)) {
          // A non-finite mark would make every comparison against it
          // false, silently pinning the session to "read" forever.
          if (typeof v === "number" && Number.isFinite(v)) readAt[k] = v;
        }
      }
      return {
        pinned: Array.isArray(obj.pinned) ? (obj.pinned as string[]) : [],
        deleted: Array.isArray(obj.deleted) ? (obj.deleted as string[]) : [],
        renames,
        // Absent in state files written before archiving existed, which
        // is every file on disk today — default rather than discard.
        archived: Array.isArray(obj.archived) ? (obj.archived as string[]) : [],
        readAt,
      };
    }
  } catch (err: unknown) {
    // ENOENT (file not found) is expected on first run; anything else is worth noting
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to load state from ${STATE_FILE}:`, err.message);
    }
  }
  return { pinned: [], deleted: [], renames: {}, archived: [], readAt: {} };
}

/**
 * Persist the user state (pinned/deleted session IDs) to disk.
 * Writes atomically-ish via writeFileSync. Logs a warning on failure.
 */
export function saveState(state: UserState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[claude-manager] Failed to save state to ${STATE_FILE}:`, message);
  }
}

/**
 * Add a session ID to the pinned list (no-op if already pinned).
 * Returns the updated state.
 */
export function pinSession(sessionId: string): UserState {
  const state = loadState();
  if (!state.pinned.includes(sessionId)) {
    state.pinned.push(sessionId);
  }
  saveState(state);
  return state;
}

/**
 * Remove a session ID from the pinned list.
 * Returns the updated state.
 */
export function unpinSession(sessionId: string): UserState {
  const state = loadState();
  state.pinned = state.pinned.filter((id) => id !== sessionId);
  saveState(state);
  return state;
}

/**
 * Soft-delete a session: add to deleted list and remove from pinned.
 * Returns the updated state.
 */
export function deleteSession(sessionId: string): UserState {
  const state = loadState();
  if (!state.deleted.includes(sessionId)) {
    state.deleted.push(sessionId);
  }
  state.pinned = state.pinned.filter((id) => id !== sessionId);
  saveState(state);
  return state;
}

/**
 * Bulk variant of `pinSession`. Single state load + single save —
 * back-to-back single-id calls would otherwise read + write
 * `~/.claude/.csm-state.json` once per id and the UI would receive
 * one stale snapshot per pin while the writes drained.
 */
export function pinSessions(sessionIds: string[]): UserState {
  const state = loadState();
  for (const id of sessionIds) {
    if (!state.pinned.includes(id)) state.pinned.push(id);
  }
  saveState(state);
  return state;
}

/** Bulk variant of `unpinSession`. */
export function unpinSessions(sessionIds: string[]): UserState {
  const state = loadState();
  const drop = new Set(sessionIds);
  state.pinned = state.pinned.filter((id) => !drop.has(id));
  saveState(state);
  return state;
}

/** Bulk variant of `deleteSession`. Strips ids from pinned too. */
export function deleteSessions(sessionIds: string[]): UserState {
  const state = loadState();
  const drop = new Set(sessionIds);
  for (const id of sessionIds) {
    if (!state.deleted.includes(id)) state.deleted.push(id);
  }
  state.pinned = state.pinned.filter((id) => !drop.has(id));
  saveState(state);
  return state;
}

/**
 * Set a custom name for a session. An empty name removes the existing rename.
 * Returns the updated state.
 */
export function renameSession(sessionId: string, name: string): UserState {
  const state = loadState();
  const trimmed = name.trim();
  if (trimmed) {
    state.renames[sessionId] = trimmed;
  } else {
    delete state.renames[sessionId];
  }
  saveState(state);
  return state;
}

/**
 * Archive a session — hide it from the default list without discarding
 * it. No-op when already archived. A pinned session is unpinned on the
 * way in: pinning means "keep this at the top", archiving means "get
 * this out of my way", and holding both would render a session pinned
 * to the top of a list it is excluded from.
 */
export function archiveSession(sessionId: string): UserState {
  const state = loadState();
  if (!state.archived.includes(sessionId)) {
    state.archived.push(sessionId);
    state.pinned = state.pinned.filter((id) => id !== sessionId);
    saveState(state);
  }
  return state;
}

/** Restore an archived session to the default list. No-op when not archived. */
export function unarchiveSession(sessionId: string): UserState {
  const state = loadState();
  if (state.archived.includes(sessionId)) {
    state.archived = state.archived.filter((id) => id !== sessionId);
    saveState(state);
  }
  return state;
}

/** Archive several sessions in one write. */
export function archiveSessions(sessionIds: string[]): UserState {
  const state = loadState();
  const adding = sessionIds.filter((id) => !state.archived.includes(id));
  if (adding.length === 0) return state;
  state.archived.push(...adding);
  state.pinned = state.pinned.filter((id) => !adding.includes(id));
  saveState(state);
  return state;
}

/**
 * Mark a session read as of `at` (epoch ms, injected so callers can
 * stamp a consistent time and tests need no clock).
 *
 * The mark only ever moves forward. Reopening an old session must not
 * rewind it behind activity the user has already seen.
 */
export function markSessionRead(sessionId: string, at: number): UserState {
  const state = loadState();
  if (!Number.isFinite(at)) return state;
  const prev = state.readAt[sessionId];
  if (prev !== undefined && prev >= at) return state;
  state.readAt[sessionId] = at;
  saveState(state);
  return state;
}

/**
 * Mark a session unread by dropping its read mark entirely.
 *
 * Dropping the entry rather than zeroing it keeps "never opened" and
 * "deliberately marked unread" as the same state, which is what the
 * user means by both.
 */
export function markSessionUnread(sessionId: string): UserState {
  const state = loadState();
  if (!(sessionId in state.readAt)) return state;
  delete state.readAt[sessionId];
  saveState(state);
  return state;
}

/**
 * True when `lastActivityMs` is newer than the session's read mark.
 * Pure, so the list and the badge count cannot disagree.
 */
export function isSessionUnread(
  state: UserState,
  sessionId: string,
  lastActivityMs: number,
): boolean {
  const mark = state.readAt[sessionId];
  if (mark === undefined) return true;
  return lastActivityMs > mark;
}
