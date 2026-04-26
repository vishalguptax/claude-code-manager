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

/**
 * Request messages for a session.
 *  - `mode` picks first-N or last-N paging (default "last").
 *  - `query` switches the host into full-transcript search mode —
 *    paging is bypassed, every matching message comes back with a
 *    `detailQuery` echo so stale replies can be dropped.
 */
export function sendGetSessionDetail(
  sessionId: string,
  mode: "first" | "last" = "last",
  query: string = "",
): void {
  _vscode.postMessage({ type: "getSessionDetail", sessionId, mode, query });
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

/** Open a chat tab pre-filled with the given prompt. */
export function sendLaunchChatWithPrompt(prompt: string): void {
  _vscode.postMessage({ type: "launchChatWithPrompt", prompt });
}

/** Open a project folder and fire the chat URI in the new window. */
export function sendOpenProjectAndChat(projectPath: string): void {
  _vscode.postMessage({ type: "openProjectAndChat", projectPath });
}

/**
 * Force a full re-parse + re-post of every tab's data on the host.
 * Backs the toolbar refresh button. Host replies asynchronously with a
 * `reloadComplete` message once data is back on the wire.
 */
export function sendReloadAll(): void {
  _vscode.postMessage({ type: "reloadAll" });
}

/** Bulk pin / unpin — `pin` chooses which leg to take. */
export function sendBulkPinSessions(ids: string[], pin: boolean): void {
  _vscode.postMessage({ type: "bulkPinSessions", ids, pin });
}

/** Bulk delete — host pops a single confirm before doing anything. */
export function sendBulkDeleteSessions(ids: string[]): void {
  _vscode.postMessage({ type: "bulkDeleteSessions", ids });
}

/** Bulk export — host packages selected sessions into a single .zip. */
export function sendBulkExportSessions(ids: string[]): void {
  _vscode.postMessage({ type: "bulkExportSessions", ids });
}
