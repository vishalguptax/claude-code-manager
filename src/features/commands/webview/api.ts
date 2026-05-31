/**
 * Typed postMessage builders for the commands feature. Each builder returns
 * a `WebviewMessage` from the shared protocol, so the compiler guarantees the
 * shape matches what the host validates with valibot. Callers pass the result
 * to the `post` function from `useApi()`.
 */
import type { WebviewMessage } from "../../../shared/protocol/messages";

/** Function shape returned by the shared `useApi()` hook. */
export type Post = (msg: WebviewMessage) => void;

/** Request the list of slash commands from the host. */
export function getCommandsMsg(): WebviewMessage {
  return { type: "getCommands" };
}

/** Ask the host to open a command file in the editor. */
export function openCommandFileMsg(path: string): WebviewMessage {
  return { type: "openCommandFile", path };
}

/** Ask the host to open a URL in the default browser. */
export function openUrlMsg(url: string): WebviewMessage {
  return { type: "openUrl", url };
}

/**
 * Open the Claude Code extension's chat with the slash command pre-filled.
 * The calling UI hides this affordance unless the extension is installed.
 */
export function launchCommandInChatMsg(name: string): WebviewMessage {
  return { type: "launchChatWithPrompt", prompt: `/${name}` };
}
