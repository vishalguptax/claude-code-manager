/**
 * Session state persistence — pin/delete operations on disk.
 * Pure Node.js file I/O, no VS Code dependency.
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
      return {
        pinned: Array.isArray(obj.pinned) ? (obj.pinned as string[]) : [],
        deleted: Array.isArray(obj.deleted) ? (obj.deleted as string[]) : [],
      };
    }
  } catch (err: unknown) {
    // ENOENT (file not found) is expected on first run; anything else is worth noting
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to load state from ${STATE_FILE}:`, err.message);
    }
  }
  return { pinned: [], deleted: [] };
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
