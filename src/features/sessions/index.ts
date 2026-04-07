/**
 * Sessions feature barrel — exports the view provider and all session types.
 */
export { ClaudeSessionViewProvider } from "./viewProvider";
export type {
  Session,
  SessionDetail,
  Message,
  SessionGroup,
  Stats,
  HistoryEntry,
  SessionEntry,
  WebviewMessage,
  ExtensionMessage,
} from "./types";
