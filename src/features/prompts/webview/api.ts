/**
 * Typed webview → host message senders for the Prompt History tab.
 *
 * Every send is a `PromptsWebviewMessage`, so the compiler holds this file and
 * `features/prompts/messageHandlers.ts` to the same shapes.
 *
 * Unlike `features/checkpoints/webview/api.ts`, these do NOT round-trip
 * through `parseMessage`: the prompts variants are not in
 * `src/shared/protocol/schemas.ts` yet, and validating against a schema that
 * does not know them would reject every send. The host validates on receipt
 * (`parsePromptsMessage`), which is the boundary that has to hold. When the
 * variants land in the shared protocol, wrap `post` the way checkpoints does.
 */
import type { PromptsWebviewMessage } from "../types";

/** Prompt History sends available to the tab. */
export interface PromptsApi {
  /** Ask for the full prompt history. */
  getHistory(): void;
  /** Put a prompt's text on the system clipboard. */
  copy(text: string): void;
  /** Open the session a prompt was typed in. */
  openSession(sessionId: string): void;
}

/** Wrap the raw `post` from `useApi()` in prompt-specific typed senders. */
export function createPromptsApi(post: (m: unknown) => void): PromptsApi {
  const send = (msg: PromptsWebviewMessage): void => post(msg);
  return {
    getHistory() {
      send({ type: "getPromptHistory" });
    },
    copy(text) {
      send({ type: "copyPrompt", text });
    },
    openSession(sessionId) {
      send({ type: "openPromptSession", sessionId });
    },
  };
}
