/**
 * Typed webview → host senders for the sessions feature.
 *
 * Every send constructs a `WebviewMessage` from the shared protocol, so the
 * compiler rejects any message shape the host cannot parse. Messages go out
 * through the shared `useApi()` bridge (a thin `postMessage` wrapper acquired
 * once in main.tsx). `useApi()` contains no hooks, so calling it at module
 * scope is safe.
 */
import { useApi } from "../../../webview/hooks/useApi";
import type { WebviewMessage } from "../../../shared/protocol/messages";

/** Post a protocol-typed message to the host. */
function post(msg: WebviewMessage): void {
  useApi().post(msg);
}

/** Signal the host the webview is mounted and ready for data. */
export const sendReady = (): void => post({ type: "ready" });

/** Request a fresh session list. */
export const sendRefresh = (): void => post({ type: "refresh" });

/** Force a full re-parse + re-post of every tab. */
export const sendReloadAll = (): void => post({ type: "reloadAll" });

/** Start a new Claude session in a fresh terminal. */
export const sendNewSession = (): void => post({ type: "newSession" });

/** Start an ephemeral session whose transcript is wiped on exit. */
export const sendNewTempSession = (): void => post({ type: "newTempSession" });

/** Continue the most recent session in the current workspace. */
export const sendContinueLastSession = (): void => post({ type: "continueLastSession" });

/** Resume one session in a terminal. */
export const sendResumeSession = (
  sessionId: string,
  entrypoint?: string,
  projectPath?: string,
): void => post({ type: "resumeSession", sessionId, entrypoint, projectPath });

/** Resume several sessions in stacked terminals. */
export const sendResumeMultiple = (sessionIds: string[], projectPaths?: string[]): void =>
  post({ type: "resumeMultiple", sessionIds, projectPaths });

/** Fork a session into a new branch. */
export const sendForkSession = (sessionId: string): void =>
  post({ type: "forkSession", sessionId });

/**
 * Request a page of a session transcript.
 *  - `mode` chooses first-N or last-N (default "last").
 *  - `query` switches the host to full-transcript search; matches return
 *    with a `detailQuery` echo so stale replies can be dropped.
 */
export const sendGetSessionDetail = (
  sessionId: string,
  mode: "first" | "last" = "last",
  query = "",
): void => post({ type: "getSessionDetail", sessionId, mode, query });

/** Pin a session to the top of the list. */
export const sendPinSession = (sessionId: string): void =>
  post({ type: "pinSession", sessionId });

/** Unpin a previously pinned session. */
export const sendUnpinSession = (sessionId: string): void =>
  post({ type: "unpinSession", sessionId });

/** Hide a session from the list (host confirms first via confirmDelete). */
export const sendConfirmDelete = (sessionId: string, callback?: string): void =>
  post({ type: "confirmDelete", sessionId, callback });

/** Open a native rename input box on the host. */
export const sendRenameSession = (sessionId: string): void =>
  post({ type: "renameSession", sessionId });

/** Copy the `claude --resume <id>` command to the clipboard. */
export const sendCopyCommand = (sessionId: string): void =>
  post({ type: "copyCommand", sessionId });

/** Open a different project folder in VS Code. */
export const sendOpenProject = (projectPath: string): void =>
  post({ type: "openProject", projectPath });

/** Open a project folder then fire the chat URI in the new window. */
export const sendOpenProjectAndChat = (projectPath: string): void =>
  post({ type: "openProjectAndChat", projectPath });

/** Open an external URL in the default browser. */
export const sendOpenUrl = (url: string): void => post({ type: "openUrl", url });

/** Export one session as a portable .jsonl via Save dialog. */
export const sendExportSession = (sessionId: string): void =>
  post({ type: "exportSession", sessionId });

/** Import a portable session .jsonl. */
export const sendImportSession = (): void => post({ type: "importSession" });

/** Open a chat tab pre-filled with a prompt. */
export const sendLaunchChatWithPrompt = (prompt: string): void =>
  post({ type: "launchChatWithPrompt", prompt });

/**
 * Search inside session transcripts (full content). Host replies async via
 * a `fullTextResults` message.
 */
export const sendSearchFullText = (query: string): void =>
  post({ type: "searchFullText", query });

/** Bulk pin / unpin every id in one round-trip. */
export const sendBulkPinSessions = (ids: string[], pin: boolean): void =>
  post({ type: "bulkPinSessions", ids, pin });

/** Bulk delete with a single host-side confirm. */
export const sendBulkDeleteSessions = (ids: string[]): void =>
  post({ type: "bulkDeleteSessions", ids });

/** Bulk export selected sessions as one .zip. */
export const sendBulkExportSessions = (ids: string[]): void =>
  post({ type: "bulkExportSessions", ids });
