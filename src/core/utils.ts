/**
 * Shared pure utilities — no VS Code or DOM dependency.
 */

/**
 * Normalize a file path for cross-platform comparison.
 * Converts backslashes to forward slashes, strips trailing slashes, and lowercases.
 */
export function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Entrypoint strings the Claude Code VS Code extension records in
 * session JSONL files. The current production build writes
 * "claude-vscode" but older sessions were tagged "vscode". Both values
 * mean "this session started inside the extension chat tab" — used by
 * the UI badge and the auto-resume router to decide where to reopen it.
 * Kept in src/core (not src/extension) so the webview can import it.
 */
export const EXTENSION_ENTRYPOINTS: ReadonlySet<string> = new Set([
  "claude-vscode",
  "vscode",
]);

/** True if a session's entrypoint string identifies the VS Code extension. */
export function isExtensionEntrypoint(entrypoint: string | undefined): boolean {
  return entrypoint !== undefined && EXTENSION_ENTRYPOINTS.has(entrypoint);
}

/**
 * Generate a cryptographically-random-ish nonce string for CSP script tags.
 * Returns a 32-character alphanumeric string.
 */
export function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
