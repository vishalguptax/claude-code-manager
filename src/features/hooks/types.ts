/**
 * Type definitions for the hooks feature.
 * Covers hook data and extension-webview message protocol.
 */

/**
 * Known Claude Code hook event types. See `events.ts` for the full
 * catalog with display labels and descriptions (used by the "add
 * hook" wizard and list grouping). New events may be added by Claude
 * Code before this list is updated, so consumers must handle unknown
 * strings — hence the `| string` fallback.
 */
export type HookEvent =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Notification"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PostCompact"
  | "PermissionRequest"
  | "PermissionDenied"
  | string;

/**
 * Where the hook is defined.
 *  - `global` / `project` / `local`: from a settings.json file (editable)
 *  - `plugin`: declared by an installed plugin's plugin.json (read-only)
 */
export type HookScope = "global" | "project" | "local" | "plugin";

/**
 * The action a hook record performs. "command" is the classic (and
 * only editable) shape; the others are rendered read-only.
 */
export type HookActionType = "command" | "prompt" | "agent" | "http" | "mcp_tool" | string;

/** A single hook entry from the Claude Code settings. */
export interface Hook {
  /** The event type this hook triggers on (e.g. "PreToolUse"). */
  event: HookEvent;
  /** Glob or string pattern to match against (e.g. tool name). */
  matcher: string;
  /**
   * Display/identity string: the shell command for "command" hooks,
   * or the prompt/url/tool text for other action types.
   */
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
  /** The record's action type. Only "command" hooks are editable. */
  hookType: HookActionType;
  /** Timeout in seconds, when the record configures one. */
  timeout?: number;
  /** Index of the outer entry within its `hooks[event]` (or `_disabled_hooks[event]`) array. */
  entryIndex: number;
  /** Index within the entry's nested `hooks` array; `null` for the legacy flat shape. */
  commandIndex: number | null;
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
  | {
      type: "updateHook";
      original: Hook;
      next: {
        matcher: string;
        command: string;
        /** New event; omit to keep the current one. */
        event?: string;
        /** New scope; omit to keep the current one (a change moves files). */
        scope?: HookScope;
        /** Timeout in seconds; omit/undefined removes it. */
        timeout?: number;
      };
    }
  /** Native VS Code wizard flow: pick scope/event, then matcher + command. */
  | { type: "promptAddHook" }
  /** Open the read-only /hooks panel in a terminal. */
  | { type: "openHooksPanel" };
