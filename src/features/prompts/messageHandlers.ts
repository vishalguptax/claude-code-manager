/**
 * Host-side message dispatch for the Prompt History feature.
 *
 * Mirrors `features/checkpoints/messageHandlers.ts`: the handler depends only
 * on a narrow {@link PromptsHostContext}, so it never reaches into another
 * feature's provider, and the provider that owns the webview delegates prompt
 * messages here.
 *
 * One deliberate difference. The checkpoints and MCP handlers validate with
 * `parseMessage` from `src/shared/protocol/schemas.ts`; these message types
 * are not in that union yet, so validation is local ({@link parsePromptsMessage}).
 * Once the variants land in the shared protocol this function should be
 * deleted and `parseMessage` used instead — the call sites do not change.
 */
import * as vscode from "vscode";
import type { PanelSink } from "../../extension/panelSink";
import { copyPromptToClipboard, openPromptSession } from "./commands";
import { readPromptHistory } from "./parser";
import type { PromptsWebviewMessage } from "./types";

/** Narrow host surface the prompts handler needs. */
export interface PromptsHostContext {
  /** The live webview, or undefined when the view is not resolved. */
  getWebview(): PanelSink | undefined;
  /**
   * Open the session a prompt belongs to. Bound by the provider to the
   * sessions feature's existing resume path — this feature owns no terminal,
   * worktree or branch logic of its own.
   */
  resumeSession(sessionId: string): Promise<void>;
}

/**
 * Message types this feature owns on the webview → host direction.
 *
 * Note none of them START with `prompt`: the dispatcher in
 * `features/sessions/messageHandlers.ts` exempts `prompt*` types from its
 * slow-handler tripwire because those are the config feature's modal dialogs,
 * which idle waiting on the user. Reading four thousand lines is real work and
 * should be timed like it.
 */
const PROMPTS_TYPES: ReadonlySet<string> = new Set([
  "getPromptHistory",
  "copyPrompt",
  "openPromptSession",
]);

/**
 * Narrow an untrusted postMessage payload to a prompts message.
 *
 * Returns null for anything this feature does not own OR anything that owns
 * the right `type` with the wrong fields — a malformed message is not ours to
 * act on, and {@link handlePromptsMessage} tells the two apart via
 * {@link PROMPTS_TYPES}.
 */
export function parsePromptsMessage(raw: unknown): PromptsWebviewMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as Record<string, unknown>;

  switch (msg.type) {
    case "getPromptHistory":
      return { type: "getPromptHistory" };
    case "copyPrompt":
      return typeof msg.text === "string" ? { type: "copyPrompt", text: msg.text } : null;
    case "openPromptSession":
      return typeof msg.sessionId === "string"
        ? { type: "openPromptSession", sessionId: msg.sessionId }
        : null;
    default:
      return null;
  }
}

/**
 * Validate and handle one Prompt History webview → host message.
 *
 * @returns `true` if the message was a prompts message (handled or rejected),
 *   `false` if the caller should try other handlers.
 */
export async function handlePromptsMessage(
  raw: unknown,
  ctx: PromptsHostContext,
): Promise<boolean> {
  const msg = parsePromptsMessage(raw);
  if (!msg) {
    // Claim-and-reject only what looks like ours; otherwise defer so the
    // next handler in the chain gets its turn.
    const type = (raw as { type?: unknown } | null)?.type;
    if (typeof type === "string" && PROMPTS_TYPES.has(type)) {
      console.error(`[claude-manager] rejected malformed prompts message: ${type}`);
      return true;
    }
    return false;
  }

  switch (msg.type) {
    case "getPromptHistory": {
      const wv = ctx.getWebview();
      if (!wv) return true;
      // The whole list ships once and the webview filters it in a computed.
      // Sending a host-filtered slice per keystroke would re-stat the file on
      // every character for no gain — the list is already in the webview.
      wv.postMessage({ type: "promptHistory", data: readPromptHistory() });
      return true;
    }

    case "copyPrompt": {
      await copyPromptToClipboard(msg.text);
      return true;
    }

    case "openPromptSession": {
      // Wrapped, not passed by reference: the provider may implement
      // `resumeSession` as a method that needs its receiver.
      await openPromptSession(msg.sessionId, (id) => ctx.resumeSession(id));
      return true;
    }
  }
}
