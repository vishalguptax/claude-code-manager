/**
 * Integration helpers for the official Claude Code VS Code extension
 * (`anthropic.claude-code`).
 *
 * The extension is entirely optional — Claude Manager works without it.
 * There are two ways in, and which one we take is decided per call:
 *
 *  1. **URI handler** — `<scheme>://anthropic.claude-code/open` with
 *     `session` and `prompt` query parameters. The documented entry
 *     point, present in every build, and the only one that can reach a
 *     window other than ours. Its handler hard-routes to
 *     `claude-vscode.primaryEditor.open`, so the chat always lands in an
 *     editor tab regardless of where the user asked chat to live.
 *
 *  2. **`claude-vscode.editor.open` command** — the only entry point that
 *     consults the user's own `claudeCode.preferredLocation`, so it is
 *     the only way a session can open in the Claude Code side bar. Not
 *     documented API, and commands only reach the window we run in.
 *
 * The URI stays the default. The command is used solely when the user has
 * set `claudeCode.preferredLocation` to `sidebar`, which is the one case
 * the URI provably cannot satisfy — so a user who never touched that
 * setting keeps byte-identical behaviour.
 */

import * as vscode from "vscode";

/** Marketplace ID of the official extension. */
export const CLAUDE_CODE_EXTENSION_ID = "anthropic.claude-code";

/**
 * Placement-aware open command registered by the official extension.
 * Undocumented, hence the capability probe in `hasChatOpenCommand`.
 *
 * The probe answers "does this command exist", NOT "does it still take
 * these arguments". We pass six positional arguments; if a future build
 * inserts or reorders one, `executeCommand` will not throw — our
 * `FULL_EDITOR` would simply arrive in the wrong slot and the chat would
 * open somewhere unintended. Nothing here can detect that, which is the
 * standing cost of using an entry point that is not public API. The URI
 * handler below is the documented one and stays the default; if this
 * command ever starts misplacing chats, deleting the command branch
 * restores the old behaviour wholesale.
 */
const CHAT_OPEN_COMMAND = "claude-vscode.editor.open";

/**
 * The command's placement decision reads, in the extension's own build:
 *
 *   if (programmatic) return {
 *     target: programmatic === "honor-preferred-location"
 *          && preferredLocation === "sidebar"
 *          && !sessionAlreadyOpenInPanel ? "sidebar" : "panel",
 *     updatePreferredLocationToPanel: false,
 *   }
 *
 * Two consequences we depend on. The side bar is reachable only with this
 * exact token — any other value falls back to an editor tab. And passing
 * a `programmatic` marker at all is what pins
 * `updatePreferredLocationToPanel` to false: called without one, the
 * command rewrites the user's global `claudeCode.preferredLocation` as a
 * side effect of opening a tab. We read that setting; we never write it.
 */
const HONOR_PREFERRED_LOCATION = "honor-preferred-location";

/**
 * `fullEditor` argument. Only consulted on the editor-tab branch, which
 * this module reaches only for a session that already has a panel — and
 * that path reveals the existing panel before the flag is read. Passing
 * `true` keeps us aligned with `primaryEditor.open`, which is what the
 * URI handler has always used, should the branch ever become live.
 */
const FULL_EDITOR = true;

/**
 * URI scheme of the running host. VS Code is `vscode`, but forks own
 * their own scheme — Cursor is `cursor`, Windsurf is `windsurf`,
 * VS Code Insiders is `vscode-insiders`. Hardcoding `vscode://` here
 * routed every deep link to a freshly launched VS Code instead of the
 * IDE the user is actually in; `vscode.env.uriScheme` is the host's own
 * scheme, so the URI is delivered back to this same window.
 */
function hostUriScheme(): string {
  return vscode.env.uriScheme;
}

// Re-export the entrypoint helpers from core/utils so extension-host
// callers can import them from this module alongside the URI helpers.
// The shared definition lives in core so the webview can also reach it
// without a vscode import.
export { isExtensionEntrypoint } from "../core/utils";

/**
 * Whether the Claude Code extension is installed. Presence is enough —
 * we don't wait for `isActive`, since the URI handler is registered at
 * activation and VS Code will activate the extension on first URI
 * dispatch anyway. Checking `isActive` would make us miss legitimate
 * installs on a cold panel.
 */
export function isClaudeCodeExtensionInstalled(): boolean {
  return vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID) !== undefined;
}

/** Options shared by both open helpers. */
export interface ChatOpenOptions {
  /**
   * The chat belongs in a window we have just asked VS Code to open, not
   * in ours. Commands execute in this extension host and cannot cross
   * windows, so such a call must go out as a URI — VS Code routes it to
   * the window that owns the handler. Placement there is whatever the
   * extension's URI handler picks.
   */
  newWindow?: boolean;
}

/**
 * Whether the user asked for chat to live in the Claude Code side bar.
 * `claudeCode.preferredLocation` is the official extension's own setting
 * (`sidebar` | `panel`, default `panel`); Claude Manager reads it so the
 * two extensions cannot disagree about where chat belongs, and adds no
 * competing setting of its own.
 */
function prefersSidebar(): boolean {
  return (
    vscode.workspace
      .getConfiguration("claudeCode")
      .get<string>("preferredLocation", "panel") === "sidebar"
  );
}

/**
 * Activate the extension and report whether `CHAT_OPEN_COMMAND` exists.
 *
 * Activation first, because commands are registered during activation:
 * probing a cold extension would answer "absent" for a command that is
 * merely not registered yet. Only a positive answer is cached — a
 * negative one can be the user installing the extension mid-session, and
 * `getCommands` is an in-process lookup, so re-probing is cheap.
 */
let chatOpenCommandFound = false;

async function hasChatOpenCommand(): Promise<boolean> {
  if (chatOpenCommandFound) return true;
  const ext = vscode.extensions.getExtension(CLAUDE_CODE_EXTENSION_ID);
  if (!ext) return false;
  try {
    if (!ext.isActive) await ext.activate();
    chatOpenCommandFound = (await vscode.commands.getCommands(true)).includes(
      CHAT_OPEN_COMMAND,
    );
  } catch {
    return false;
  }
  return chatOpenCommandFound;
}

/**
 * Fire the documented URI handler. Always available, always an editor tab.
 *
 * `encodeURIComponent`, not `URLSearchParams`: the latter percent-encodes
 * to the form-encoded profile, where a space becomes `+`. Both decode
 * identically on the far side, but the URI is user-visible in deep links
 * and logs, so keep the literal encoding this handler has always been
 * given.
 */
function openChatUri(session?: string, prompt?: string): Thenable<boolean> {
  const params: string[] = [];
  if (session) params.push(`session=${encodeURIComponent(session)}`);
  if (prompt) params.push(`prompt=${encodeURIComponent(prompt)}`);
  const base = `${hostUriScheme()}://${CLAUDE_CODE_EXTENSION_ID}/open`;
  return vscode.env.openExternal(
    vscode.Uri.parse(params.length > 0 ? `${base}?${params.join("&")}` : base),
  );
}

/**
 * Open the extension's chat on a session, a prompt, or neither.
 *
 * Takes the command only when it can do something the URI cannot: the
 * user prefers the side bar, the target is this window, and the command
 * is really there. Every other call — and any failure of that one — goes
 * out as the URI it has always been.
 *
 * Resolves true when a surface accepted the request: the command ran
 * without throwing, or `openExternal` reported the URI as handled.
 * Neither answer promises the chat is on screen — placement is the other
 * extension's decision and it reports nothing back — so this is a
 * "handed off successfully" signal, not a "shown" one.
 */
async function openChat(
  session: string | undefined,
  prompt: string | undefined,
  opts: ChatOpenOptions,
): Promise<boolean> {
  if (!opts.newWindow && prefersSidebar() && (await hasChatOpenCommand())) {
    try {
      await vscode.commands.executeCommand(
        CHAT_OPEN_COMMAND,
        session,
        prompt || undefined,
        undefined, // view column — resolved by the extension
        undefined, // tab group — panel-only, unused here
        FULL_EDITOR,
        { programmatic: HONOR_PREFERRED_LOCATION },
      );
      // The command resolves undefined; reaching here without throwing
      // is the only success signal it offers.
      return true;
    } catch {
      /* fall through to the URI handler */
    }
  }
  return openChatUri(session, prompt);
}

/**
 * Open a session in the extension's chat.
 *
 * Per the extension docs the session must belong to the current
 * workspace — neither entry point can cross workspaces. Callers that
 * know the session lives in a different project should open that
 * project window first, then call this with `newWindow` set.
 */
export function openSessionInExtension(
  sessionId: string,
  opts: ChatOpenOptions = {},
): Promise<boolean> {
  return openChat(sessionId, undefined, opts);
}

/**
 * Open a new chat with the prompt pre-filled. Useful for "launch a
 * slash command in chat", "ask again" from a session detail row, and
 * skill / template launchers. Empty prompts are allowed and mean
 * "blank chat".
 */
export function openPromptInExtension(
  prompt: string,
  opts: ChatOpenOptions = {},
): Promise<boolean> {
  return openChat(undefined, prompt || undefined, opts);
}

/** Test seam: drop the cached capability probe. */
export function resetChatOpenCommandProbe(): void {
  chatOpenCommandFound = false;
}
