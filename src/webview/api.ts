/**
 * Typed wrapper around vscode.postMessage for all webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "./types";

let _vscode: VSCodeAPI;

/**
 * Initialize the API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Signal to the extension that the webview is ready. */
export function sendReady(): void {
  _vscode.postMessage({ type: "ready" });
}

/** Request a fresh session list from the extension. */
export function sendRefresh(): void {
  _vscode.postMessage({ type: "refresh" });
}

/** Request a new Claude terminal session. */
export function sendNewSession(): void {
  _vscode.postMessage({ type: "newSession" });
}

/** Resume a specific session in the terminal. */
export function sendResumeSession(sessionId: string, entrypoint: string, projectPath: string): void {
  _vscode.postMessage({ type: "resumeSession", sessionId, entrypoint, projectPath });
}

/** Resume multiple sessions in separate terminals. */
export function sendResumeMultiple(sessionIds: string[], projectPaths: string[]): void {
  _vscode.postMessage({ type: "resumeMultiple", sessionIds, projectPaths });
}

/** Request full detail for a session. */
export function sendGetSessionDetail(sessionId: string): void {
  _vscode.postMessage({ type: "getSessionDetail", sessionId });
}

/** Pin a session to the top of the list. */
export function sendPinSession(sessionId: string): void {
  _vscode.postMessage({ type: "pinSession", sessionId });
}

/** Unpin a previously pinned session. */
export function sendUnpinSession(sessionId: string): void {
  _vscode.postMessage({ type: "unpinSession", sessionId });
}

/** Prompt the user to confirm deletion of a session. */
export function sendConfirmDelete(sessionId: string, callback?: string): void {
  _vscode.postMessage({ type: "confirmDelete", sessionId, callback });
}

/** Fork a session (create a new session branching from this one). */
export function sendForkSession(sessionId: string): void {
  _vscode.postMessage({ type: "forkSession", sessionId });
}

/** Copy the resume command for a session to the clipboard. */
export function sendCopyCommand(sessionId: string): void {
  _vscode.postMessage({ type: "copyCommand", sessionId });
}

/** Open a different project folder in VS Code. */
export function sendOpenProject(projectPath: string): void {
  _vscode.postMessage({ type: "openProject", projectPath });
}

/** Open an external URL in the default browser. */
export function sendOpenUrl(url: string): void {
  _vscode.postMessage({ type: "openUrl", url });
}
