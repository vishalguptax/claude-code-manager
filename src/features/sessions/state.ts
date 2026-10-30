/**
 * Session state persistence — pin / delete / archive / folder operations on
 * disk. Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import { STATE_FILE } from "../../core/config";
import { writeFileAtomic } from "../../core/atomicWrite";
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
      const state: UserState = {
        pinned: Array.isArray(obj.pinned) ? (obj.pinned as string[]) : [],
        deleted: Array.isArray(obj.deleted) ? (obj.deleted as string[]) : [],
        renames: readStringMap(obj.renames),
        // Absent in state files written before archiving existed, which
        // is every file on disk today — default rather than discard.
        archived: Array.isArray(obj.archived) ? (obj.archived as string[]) : [],
        // Absent in state files written before folders existed.
        folders: readStringMap(obj.folders),
        folderNames: Array.isArray(obj.folderNames)
          ? obj.folderNames.filter((n): n is string => typeof n === "string")
          : [],
      };
      return withAllFolderNames(state);
    }
  } catch (err: unknown) {
    // ENOENT (file not found) is expected on first run; anything else is worth noting
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to load state from ${STATE_FILE}:`, err.message);
    }
  }
  return { pinned: [], deleted: [], renames: {}, archived: [], folders: {}, folderNames: [] };
}

/** Make `folderNames` list every folder a session is filed in, once each. */
function withAllFolderNames(state: UserState): UserState {
  state.folderNames = [...new Set([...state.folderNames, ...Object.values(state.folders)])];
  return state;
}

/** Keep only the string-valued entries of a parsed JSON object. */
function readStringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof raw === "object" && raw !== null) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/**
 * Persist the user state (pinned/deleted session IDs) to disk. Logs a
 * warning on failure.
 *
 * Atomic because every VS Code window reads and writes this one file: a
 * window that loads it mid-write would see truncated JSON, fall back to the
 * empty default above, and its next save would wipe every pin, rename and
 * archive. Each mutator below therefore also loads, mutates and saves in one
 * synchronous step — never holding a copy across an await — so a write from
 * another window is never overwritten by stale state.
 */
export function saveState(state: UserState): void {
  try {
    writeFileAtomic(STATE_FILE, JSON.stringify(state, null, 2));
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
  delete state.folders[sessionId];
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

/** Bulk variant of `deleteSession`. Strips ids from pinned and folders too. */
export function deleteSessions(sessionIds: string[]): UserState {
  const state = loadState();
  const drop = new Set(sessionIds);
  for (const id of sessionIds) {
    if (!state.deleted.includes(id)) state.deleted.push(id);
    delete state.folders[id];
  }
  state.pinned = state.pinned.filter((id) => !drop.has(id));
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
 * File sessions into a folder, or take them out of whichever folder they
 * are in when `folder` is blank. Filing into a name that is not a folder
 * yet creates it. Emptying a folder keeps it; only removeFolder drops one.
 */
export function setSessionsFolder(sessionIds: string[], folder: string): UserState {
  const state = loadState();
  const name = folder.trim();
  for (const id of sessionIds) {
    if (name) state.folders[id] = name;
    else delete state.folders[id];
  }
  if (name && !state.folderNames.includes(name)) state.folderNames.push(name);
  saveState(state);
  return state;
}

/** Create an empty folder. No-op for a blank name or one that exists. */
export function createFolder(folder: string): UserState {
  const state = loadState();
  const name = folder.trim();
  if (name && !state.folderNames.includes(name)) {
    state.folderNames.push(name);
    saveState(state);
  }
  return state;
}

/**
 * Rename a folder by re-filing every session in it. Renaming onto an
 * existing folder's name merges the two, which is what moving everything
 * there by hand would have done.
 */
export function renameFolder(from: string, to: string): UserState {
  const state = loadState();
  const name = to.trim();
  if (name && name !== from) {
    for (const [id, folder] of Object.entries(state.folders)) {
      if (folder === from) state.folders[id] = name;
    }
    state.folderNames = [...new Set(state.folderNames.map((n) => (n === from ? name : n)))];
    saveState(state);
  }
  return state;
}

/** Remove a folder. Its sessions stay, unfiled. */
export function removeFolder(folder: string): UserState {
  const state = loadState();
  for (const [id, f] of Object.entries(state.folders)) {
    if (f === folder) delete state.folders[id];
  }
  state.folderNames = state.folderNames.filter((n) => n !== folder);
  saveState(state);
  return state;
}
