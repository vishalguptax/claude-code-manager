/**
 * Command parsing — reads Claude Code slash command files from disk
 * and provides the catalog of built-in slash commands.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Command } from "./types";

/** Global commands directory: ~/.claude/commands/ */
const GLOBAL_COMMANDS_DIR: string = path.join(os.homedir(), ".claude", "commands");

/**
 * Catalog of built-in slash commands shipped with the Claude Code CLI.
 * Each entry mirrors the documentation at https://code.claude.com/docs/en/commands.
 * The tuple is `[name, description]`.
 */
const BUILTIN_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ["add-dir", "Add a working directory for file access"],
  ["agents", "Manage agent configurations"],
  ["btw", "Ask a quick side question without adding to conversation"],
  ["chrome", "Configure Claude in Chrome settings"],
  ["clear", "Clear conversation history (aliases: /reset, /new)"],
  ["color", "Set the prompt bar color"],
  ["compact", "Compact conversation with optional focus"],
  ["config", "Open Settings interface (alias: /settings)"],
  ["context", "Visualize current context usage"],
  ["copy", "Copy the last assistant response to clipboard"],
  ["cost", "Show token usage statistics"],
  ["diff", "Open an interactive diff viewer"],
  ["doctor", "Diagnose Claude Code installation"],
  ["effort", "Set the model effort level"],
  ["exit", "Exit the CLI (alias: /quit)"],
  ["export", "Export the current conversation as plain text"],
  ["fast", "Toggle fast mode"],
  ["feedback", "Submit feedback (alias: /bug)"],
  ["branch", "Create a branch of the conversation (alias: /fork)"],
  ["help", "Show help and available commands"],
  ["hooks", "View hook configurations"],
  ["ide", "Manage IDE integrations"],
  ["init", "Initialize project with CLAUDE.md"],
  ["insights", "Generate session analysis report"],
  ["install-github-app", "Set up Claude GitHub Actions"],
  ["install-slack-app", "Install Claude Slack app"],
  ["keybindings", "Open keybindings configuration"],
  ["login", "Sign in to Anthropic account"],
  ["logout", "Sign out"],
  ["mcp", "Manage MCP server connections"],
  ["memory", "Edit CLAUDE.md memory files"],
  ["model", "Select or change the AI model"],
  ["permissions", "Manage tool permissions (alias: /allowed-tools)"],
  ["plan", "Enter plan mode"],
  ["plugin", "Manage plugins"],
  ["privacy-settings", "View privacy settings"],
  ["release-notes", "View changelog"],
  ["reload-plugins", "Reload all active plugins"],
  ["rename", "Rename the current session"],
  ["resume", "Resume a conversation (alias: /continue)"],
  ["rewind", "Rewind conversation (alias: /checkpoint)"],
  ["sandbox", "Toggle sandbox mode"],
  ["security-review", "Analyze pending changes for security issues"],
  ["skills", "List available skills"],
  ["stats", "Visualize daily usage and history"],
  ["status", "Open Settings (Status tab)"],
  ["statusline", "Configure status line"],
  ["tasks", "List background tasks (alias: /bashes)"],
  ["theme", "Change color theme"],
  ["upgrade", "Open upgrade page"],
  ["usage", "Show plan usage limits"],
  ["voice", "Toggle voice dictation"],
];

/**
 * Return the catalog of built-in Claude Code slash commands as Command objects.
 * Built-ins have `scope: "builtin"`, an empty `content` and `path`, and a
 * `description` populated from the documentation.
 *
 * @returns Sorted array of built-in commands.
 */
export function getBuiltInCommands(): Command[] {
  return BUILTIN_COMMANDS.map(
    ([name, description]): Command => ({
      name,
      scope: "builtin",
      content: "",
      path: "",
      description,
    }),
  );
}

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
 * Parse all Claude Code slash commands from built-ins, the global directory,
 * and the optional project directory.
 *
 * Built-in commands come from {@link getBuiltInCommands}, global commands
 * from ~/.claude/commands/, and project commands from .claude/commands/
 * relative to the given workspace path.
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 *   When not provided, only built-in and global commands are returned.
 * @returns Array of all known commands: built-ins first, then global, then project.
 */
export function parseCommands(workspacePath?: string): Command[] {
  const commands: Command[] = [];

  // Built-in commands shipped with Claude Code
  commands.push(...getBuiltInCommands());

  // Global commands
  commands.push(...readCommandsFromDir(GLOBAL_COMMANDS_DIR, "global"));

  // Project commands
  if (workspacePath) {
    const projectCommandsDir = path.join(workspacePath, ".claude", "commands");
    commands.push(...readCommandsFromDir(projectCommandsDir, "project"));
  }

  return commands;
}
