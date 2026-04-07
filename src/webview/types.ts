/**
 * Shared webview type definitions.
 */

/** The VS Code API available in webview context. */
export interface VSCodeAPI {
  postMessage(msg: unknown): void;
}

/** Date filter options for the session list. */
export type DateFilter = "today" | "week" | "month" | "all";

/** View mode for the webview. */
export type View = "list" | "detail";
