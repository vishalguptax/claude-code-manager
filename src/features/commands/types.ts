/**
 * Type definitions for the commands feature.
 * Covers command data and extension-webview message protocol.
 */

/** The scope of a slash command: user-level or project-level. */
export type CommandScope = "global" | "project";

/** A parsed Claude Code slash command. */
export interface Command {
  /** Command name derived from the filename (e.g. "review" from review.md). */
  name: string;
  /** Whether the command is global (~/.claude/commands/) or project-level (.claude/commands/). */
  scope: CommandScope;
  /** Raw markdown content of the command file. */
  content: string;
  /** Absolute path to the .md file on disk. */
  path: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for the commands feature. */
export type CommandsExtensionMessage =
  | { type: "commands"; data: Command[] }
  | { type: "commandsError"; message: string };

/** Messages sent from the webview to the extension host for the commands feature. */
export type CommandsWebviewMessage =
  | { type: "getCommands" }
  | { type: "openCommandFile"; path: string };
