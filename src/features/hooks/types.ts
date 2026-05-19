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

/**
 * Where the hook is defined.
 *  - `global` / `project` / `local`: from a settings.json file (editable)
 *  - `plugin`: declared by an installed plugin's plugin.json (read-only)
 */
export type HookScope = "global" | "project" | "local" | "plugin";

/** A single hook entry from the Claude Code settings. */
export interface Hook {
  /** The event type this hook triggers on (e.g. "PreToolUse"). */
  event: HookEvent;
  /** Glob or string pattern to match against (e.g. tool name). */
  matcher: string;
  /** Shell command to execute when the hook fires. */
  command: string;
  /** Source of this hook: global (~/.claude), project (.claude/settings.json), or local (.claude/settings.local.json) */
  scope: HookScope;
  /**
   * True when the hook lives under `_disabled_hooks` instead of
   * `hooks` in settings.json. Disabled hooks are preserved verbatim
   * so re-enable is a structural move, not a re-author. Always
   * `false` for `scope: "plugin"` hooks (plugins do not have a
   * disabled block).
   */
  disabled: boolean;
  /**
   * Qualified plugin name (e.g. "caveman@caveman") when this hook
   * was declared by a plugin's plugin.json. Undefined for hooks
   * sourced from a settings.json file.
   */
  pluginName?: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for the hooks feature. */
export type HooksExtensionMessage =
  | { type: "hooks"; data: Hook[] }
  | { type: "hooksError"; message: string };

/** Messages sent from the webview to the extension host for the hooks feature. */
export type HooksWebviewMessage =
  | { type: "getHooks" }
  /**
   * Toggle a hook between active (`hooks`) and parked
   * (`_disabled_hooks`). The host moves the entry between blocks
   * verbatim — no field rewriting — so re-enabling restores the
   * previous matcher / command bytes exactly.
   */
  | { type: "toggleHookEnabled"; hook: Hook }
  /** Delete a hook entry. Host shows a confirm modal first. */
  | { type: "deleteHook"; hook: Hook }
  /**
   * Apply edits to an existing hook. Identifies the target by the
   * `original` snapshot (scope + event + matcher + command) and
   * rewrites it with the `next` values. Disabled hooks edit their
   * parked block — staying disabled — so toggling and editing are
   * independent.
   */
  | { type: "updateHook"; original: Hook; next: { matcher: string; command: string } }
  /** Native VS Code wizard flow: pick scope/event, then matcher + command. */
  | { type: "promptAddHook" };
