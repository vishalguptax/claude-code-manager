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
