/**
 * Type definitions for the hooks feature.
 * Covers hook data and extension-webview message protocol.
 */

/**
 * Known Claude Code hook event types.
 * New events may be added in the future, so consumers should handle unknown strings.
 */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "Notification"
  | "Stop"
  | "SubagentStop"
  | string;

/** A single hook entry from the Claude Code settings. */
export interface Hook {
  /** The event type this hook triggers on (e.g. "PreToolUse"). */
  event: HookEvent;
  /** Glob or string pattern to match against (e.g. tool name). */
  matcher: string;
  /** Shell command to execute when the hook fires. */
  command: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for the hooks feature. */
export type HooksExtensionMessage =
  | { type: "hooks"; data: Hook[] }
  | { type: "hooksError"; message: string };

/** Messages sent from the webview to the extension host for the hooks feature. */
export type HooksWebviewMessage =
  | { type: "getHooks" };
