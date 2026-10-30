/**
 * Where a sidebar rename lives, depending on whether it is handed to Claude
 * Code (`claudeManager.sessions.renameInClaudeCode`):
 *
 *   handed over  → a pending rename (pendingRenames) until the rename hook
 *                  gives it to Claude Code, which saves it as the session's
 *                  own `custom-title`; from then on the name comes from the
 *                  transcript like any `/rename`.
 *   sidebar only → the `renames` map in the extension's state file, which
 *                  Claude Code never sees.
 *
 * Either way the sidebar shows the new name at once: name resolution reads
 * both stores through loadRenames, with a pending rename winning.
 *
 * Plain Node, no vscode — the host decides which mode applies.
 */
import { loadState, saveState } from "./state";
import { clearPendingRename, readPendingRenames, setPendingRename } from "./pendingRenames";

/** Every name the sidebar shows over the transcript's own, by session id. */
export function loadRenames(): Record<string, string> {
  return { ...loadState().renames, ...readPendingRenames() };
}

/**
 * Rename a session. An empty name drops this extension's rename, so the
 * session shows the name Claude Code has for it. Throws when a rename for
 * Claude Code cannot be saved; nothing is changed then.
 */
export function applyRename(sessionId: string, name: string, inClaudeCode: boolean): void {
  const trimmed = name.trim();
  const state = loadState();
  if (inClaudeCode) {
    if (trimmed) setPendingRename(sessionId, trimmed);
    else clearPendingRename(sessionId);
    // A sidebar-only name from before would otherwise keep hiding the name
    // Claude Code now has.
    if (sessionId in state.renames) {
      delete state.renames[sessionId];
      saveState(state);
    }
    return;
  }
  clearPendingRename(sessionId);
  if (trimmed) state.renames[sessionId] = trimmed;
  else delete state.renames[sessionId];
  saveState(state);
}

/**
 * Hand every sidebar-only name to Claude Code — run when the user turns
 * renaming in Claude Code on, so one setting governs every name. A name that
 * cannot be parked stays sidebar-only rather than being lost.
 */
export function moveRenamesToPending(): void {
  const state = loadState();
  let changed = false;
  for (const [id, name] of Object.entries(state.renames)) {
    try {
      setPendingRename(id, name);
    } catch {
      continue;
    }
    delete state.renames[id];
    changed = true;
  }
  if (changed) saveState(state);
}

/**
 * Keep every rename Claude Code has not applied yet as a sidebar-only name —
 * run when the user turns renaming in Claude Code off, so no name they gave
 * disappears from the list.
 */
export function movePendingToRenames(): void {
  const pending = readPendingRenames();
  const ids = Object.keys(pending);
  if (ids.length === 0) return;
  const state = loadState();
  for (const id of ids) state.renames[id] = pending[id];
  saveState(state);
  for (const id of ids) clearPendingRename(id);
}
