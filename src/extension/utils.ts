import * as vscode from "vscode";

/**
 * Normalize a file path for cross-platform comparison.
 * Converts backslashes to forward slashes, strips trailing slashes, and lowercases.
 */
export function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Get the filesystem path of the first open workspace folder, or empty string if none.
 */
export function getWorkspace(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
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

/**
 * Create a new VS Code terminal with the given name and optional working directory.
 * The terminal opens beside the current editor.
 */
export function createTerminal(name: string, cwd?: string): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    location: { viewColumn: vscode.ViewColumn.Beside },
  });
}
