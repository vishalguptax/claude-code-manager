/**
 * Type definitions for the commands feature.
 * Covers command data and extension-webview message protocol.
 */

/** The scope of a slash command: user-level, project-level, or built-in to Claude Code. */
export type CommandScope = "global" | "project" | "builtin";

/** A parsed Claude Code slash command. */
export interface Command {
  /** Command name derived from the filename (e.g. "review" from review.md) or the built-in command name. */
  name: string;
  /**
   * Whether the command is global (~/.claude/commands/), project-level
   * (.claude/commands/), or "builtin" (shipped with Claude Code itself).
   */
  scope: CommandScope;
  /** Raw markdown content of the command file (empty string for built-ins). */
  content: string;
  /** Absolute path to the .md file on disk (empty string for built-ins). */
  path: string;
  /** Optional human-readable description (used for built-in commands). */
  description?: string;
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
