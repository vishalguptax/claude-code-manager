/**
 * Host-side message dispatch for the commands feature. Inbound messages from
 * the webview are validated against the shared valibot schema before they
 * reach a handler; malformed input is logged and rejected so a single bad
 * frame can never drive a host action.
 *
 * Dependencies on the VS Code API are injected via `CommandsHost` rather than
 * imported here, keeping this module pure and unit-testable. The owning
 * view provider supplies the concrete, vscode-backed implementation.
 */
import { type Message, parseMessage } from "../../shared/protocol/schemas";
import { parseCommands } from "./parser";
import type { Command } from "./types";

/** Side-effecting capabilities the host environment provides to handlers. */
export interface CommandsHost {
  /** Post a host→webview message back to the panel. */
  post: (msg: Message) => void;
  /** Open a file on disk in an editor. */
  openFile: (path: string) => void | Promise<void>;
  /** Open a URL in the default browser. */
  openUrl: (url: string) => void | Promise<void>;
  /** Launch the Claude Code chat surface with a pre-filled prompt. */
  launchChat: (prompt: string) => void | Promise<void>;
  /** Absolute path of the current workspace folder, if any. */
  workspacePath?: string;
}

/** Message types this feature handles inbound from the webview. */
const HANDLED = new Set<string>([
  "getCommands",
  "openCommandFile",
  "openUrl",
  "launchChatWithPrompt",
]);

/** True when the given message type is one this feature handles. */
export function handlesCommandsMessage(type: string): boolean {
  return HANDLED.has(type);
}

/**
 * Validate and dispatch a raw inbound message. Returns true when the message
 * belonged to this feature and was handled, false when it should be passed on.
 * Throws nothing: parse failures are logged and swallowed.
 */
export async function dispatchCommandsMessage(raw: unknown, host: CommandsHost): Promise<boolean> {
  let msg: Message;
  try {
    msg = parseMessage(raw);
  } catch (err) {
    console.warn("[claude-manager] rejected malformed commands message:", (err as Error).message);
    return false;
  }

  if (!handlesCommandsMessage(msg.type)) return false;

  switch (msg.type) {
    case "getCommands": {
      let data: Command[];
      try {
        data = parseCommands(host.workspacePath);
      } catch (err) {
        host.post({ type: "error", message: `Failed to load commands: ${(err as Error).message}` });
        return true;
      }
      host.post({ type: "commands", data });
      return true;
    }

    case "openCommandFile": {
      await host.openFile(msg.path);
      return true;
    }

    case "openUrl": {
      await host.openUrl(msg.url);
      return true;
    }

    case "launchChatWithPrompt": {
      await host.launchChat(msg.prompt);
      return true;
    }

    default:
      return false;
  }
}
