/**
 * What the rename hook says to Claude Code — see sessionRenameTap, which
 * runs it, and pendingRenames for why the hook exists.
 */
import { claimPendingRename } from "./pendingRenames";

/** The events whose hook output Claude Code reads `sessionTitle` from. */
const TITLE_EVENTS = new Set(["SessionStart", "UserPromptSubmit"]);

export interface HookPayload {
  session_id?: unknown;
  hook_event_name?: unknown;
}

/**
 * The hook's stdout for a payload: the session's pending rename as
 * `sessionTitle`, claimed so it is handed over once. Null when there is
 * nothing to say.
 */
export function renameHookOutput(payload: HookPayload | null): string | null {
  const sessionId = payload?.session_id;
  const event = payload?.hook_event_name;
  if (typeof sessionId !== "string" || typeof event !== "string") return null;
  if (!TITLE_EVENTS.has(event)) return null;
  const title = claimPendingRename(sessionId);
  if (!title) return null;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, sessionTitle: title } });
}
