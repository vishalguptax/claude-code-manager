/**
 * Prompt History feature barrel — the reader, the host message handler, and
 * the prompt domain types.
 */
export {
  clearPromptHistoryCache,
  collapseRepeats,
  measureAttachments,
  projectNameOf,
  readPromptHistory,
  readPromptHistoryUncached,
  toPromptEntry,
} from "./parser";
export { copyPromptToClipboard, openPromptSession } from "./commands";
export { handlePromptsMessage, parsePromptsMessage } from "./messageHandlers";
export type { PromptsHostContext } from "./messageHandlers";
export type {
  PromptEntry,
  PromptsExtensionMessage,
  PromptsWebviewMessage,
  RawHistoryLine,
} from "./types";
