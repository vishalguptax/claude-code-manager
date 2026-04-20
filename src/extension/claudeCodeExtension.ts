/**
 * Integration helpers for the official Claude Code VS Code extension
 * (`anthropic.claude-code`).
 *
 * The extension is entirely optional — Claude Manager works without it.
 * When present it exposes exactly one integration point: a URI handler
 * at `vscode://anthropic.claude-code/open` that accepts `session` and
 * `prompt` query parameters. Every helper in this module either detects
 * the extension or fires that URI; nothing else is public API.
 */

import * as vscode from "vscode";

/** Marketplace ID of the official extension. */
export const CLAUDE_CODE_EXTENSION_ID = "anthropic.claude-code";

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

/**
 * Open a session in the extension's chat tab via the URI handler.
 *
 * Per the extension docs the session must belong to the current
 * workspace — the URI handler cannot cross workspaces. Callers that
 * know the session lives in a different project should open that
 * project window first, then call this after a short delay (or rely
 * on the re-activation path).
 */
export function openSessionInExtension(sessionId: string): Thenable<boolean> {
  const uri = vscode.Uri.parse(
    `vscode://${CLAUDE_CODE_EXTENSION_ID}/open?session=${encodeURIComponent(sessionId)}`,
  );
  return vscode.env.openExternal(uri);
}

/**
 * Open a new chat tab with the prompt pre-filled. Useful for "launch a
 * slash command in chat", "ask again" from a session detail row, and
 * skill / template launchers. Empty prompts are allowed — the URI
 * handler treats an absent `prompt` as "blank chat".
 */
export function openPromptInExtension(prompt: string): Thenable<boolean> {
  const base = `vscode://${CLAUDE_CODE_EXTENSION_ID}/open`;
  const uri = prompt
    ? vscode.Uri.parse(`${base}?prompt=${encodeURIComponent(prompt)}`)
    : vscode.Uri.parse(base);
  return vscode.env.openExternal(uri);
}
