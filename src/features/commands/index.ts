/**
 * Commands feature barrel — exports the parser, the built-in commands
 * catalog, and all command types.
 */
export { parseCommands, getBuiltInCommands } from "./parser";
export type { Command, CommandScope, CommandsExtensionMessage, CommandsWebviewMessage } from "./types";
