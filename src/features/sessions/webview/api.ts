/**
 * Typed wrapper around vscode.postMessage for all webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";

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

/** Continue the most recent Claude Code session in the current workspace. */
export function sendContinueLastSession(): void {
  _vscode.postMessage({ type: "continueLastSession" });
}

/** Resume a specific session in the terminal. */
export function sendResumeSession(sessionId: string, entrypoint: string, projectPath: string): void {
  _vscode.postMessage({ type: "resumeSession", sessionId, entrypoint, projectPath });
}

/** Resume multiple sessions in separate terminals. */
export function sendResumeMultiple(sessionIds: string[], projectPaths: string[]): void {
  _vscode.postMessage({ type: "resumeMultiple", sessionIds, projectPaths });
}

/** Request a page of messages for a session. Defaults to "last" (most recent). */
export function sendGetSessionDetail(sessionId: string, mode: "first" | "last" = "last"): void {
  _vscode.postMessage({ type: "getSessionDetail", sessionId, mode });
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

/** Prompt the user to rename a session. Opens a VS Code input box. */
export function sendRenameSession(sessionId: string): void {
  _vscode.postMessage({ type: "renameSession", sessionId });
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

/** Export a session to a portable .jsonl file via Save dialog. */
export function sendExportSession(sessionId: string): void {
  _vscode.postMessage({ type: "exportSession", sessionId });
}

/**
 * Import a portable session .jsonl. Triggers the file picker, project
 * picker, validation, copy, and terminal launch flow on the extension side.
 */
export function sendImportSession(): void {
  _vscode.postMessage({ type: "importSession" });
}

/**
 * Search inside session transcripts (full content, not just metadata).
 * Extension replies asynchronously via a `fullTextResults` message.
 */
export function sendSearchFullText(query: string): void {
  _vscode.postMessage({ type: "searchFullText", query });
}
