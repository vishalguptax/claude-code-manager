/**
 * Shared webview flag: whether the official Claude Code extension
 * (anthropic.claude-code) is installed.
 *
 * Source of truth is the extension host — pushed to the webview in the
 * sessions settings message and again on every extension-registry
 * change. Features that want to conditionally render extension-only
 * actions (New Chat button, Launch-in-Chat entries) read this instead
 * of asking the host on every render.
 *
 * Kept in src/webview (not in a feature folder) because multiple
 * features consume it — sessions, commands, skills, and detail views
 * all gate affordances on the same flag.
 */

let installed = false;

export function setClaudeCodeExtensionInstalled(v: boolean): void {
  installed = v;
}

export function isClaudeCodeExtensionInstalled(): boolean {
  return installed;
}
