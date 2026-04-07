/**
 * Command parsing — reads Claude Code slash command files from disk.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Command } from "./types";

/** Global commands directory: ~/.claude/commands/ */
const GLOBAL_COMMANDS_DIR: string = path.join(os.homedir(), ".claude", "commands");

/**
 * Read all .md files from a directory and return them as Command objects.
 * Returns an empty array if the directory does not exist or cannot be read.
 *
 * @param dir - Absolute path to the commands directory
 * @param scope - Whether these are "global" or "project" commands
 */
function readCommandsFromDir(dir: string, scope: "global" | "project"): Command[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read commands directory ${dir}:`, (err as Error).message);
    }
    return [];
  }

  const commands: Command[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const filePath = path.join(dir, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (err: unknown) {
      console.warn(`[claude-manager] Failed to read command file ${filePath}:`, (err as Error).message);
      continue;
    }

    const name = file.replace(/\.md$/, "");
    commands.push({ name, scope, content, path: filePath });
  }

  return commands;
}

/**
 * Parse all Claude Code slash commands from both global and project directories.
 * Global commands come from ~/.claude/commands/, project commands from .claude/commands/
 * relative to the given workspace path.
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 *   When not provided, only global commands are returned.
 * @returns Array of all discovered commands, global first then project.
 */
export function parseCommands(workspacePath?: string): Command[] {
  const commands: Command[] = [];

  // Global commands
  commands.push(...readCommandsFromDir(GLOBAL_COMMANDS_DIR, "global"));

  // Project commands
  if (workspacePath) {
    const projectCommandsDir = path.join(workspacePath, ".claude", "commands");
    commands.push(...readCommandsFromDir(projectCommandsDir, "project"));
  }

  return commands;
}
