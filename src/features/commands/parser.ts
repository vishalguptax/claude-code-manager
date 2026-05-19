/**
 * Command parsing — reads Claude Code slash command files from disk
 * (`.md` and `.toml`) and provides the catalog of built-in slash
 * commands. Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, resolvePluginContentDirs, type ActivePlugin } from "../../core/plugins";
import type { Command, CommandScope } from "./types";

/** Cache parsed Command objects by their source path; readdir stays uncached. */
const commandCache = createMtimeCache<Command>();

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
 * Best-effort extraction of a top-level `description = "..."` value
 * from a TOML command file. Handles the three string forms commonly
 * seen in plugin-shipped TOML commands:
 *   - basic strings:       description = "..."
 *   - literal strings:     description = '...'
 *   - multi-line basic:    description = """..."""
 * Comments (`#`) outside strings are stripped. Lines inside multi-line
 * strings are joined with `\n`. Returns an empty string when no
 * top-level `description` key is found.
 *
 * This is not a full TOML parser by design — the command surface only
 * needs the description, and pulling a dependency just for that would
 * cost every webview user.
 */
function extractTomlDescription(raw: string): string {
  // Strip BOM and CR for predictable matching.
  const text = raw.replace(/^﻿/, "").replace(/\r/g, "");

  // Multi-line basic string: description = """..."""
  const multi = text.match(/^\s*description\s*=\s*"""([\s\S]*?)"""/m);
  if (multi) return multi[1].trim();

  // Basic string: description = "..."
  const basic = text.match(/^\s*description\s*=\s*"((?:[^"\\]|\\.)*)"/m);
  if (basic) {
    // Decode the small set of TOML escape sequences we care about.
    return basic[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }

  // Literal string: description = '...'
  const literal = text.match(/^\s*description\s*=\s*'((?:[^'\\]|\\.)*)'/m);
  if (literal) return literal[1].trim();

  return "";
}

interface ReadCommandsOpts {
  scope: CommandScope;
  pluginName?: string;
}

/**
 * Read all command files (`.md` and `.toml`) from a directory.
 * Returns an empty array if the directory does not exist or cannot be read.
 */
function readCommandsFromDir(dir: string, opts: ReadCommandsOpts): Command[] {
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
    const isMd = file.endsWith(".md");
    const isToml = file.endsWith(".toml");
    if (!isMd && !isToml) continue;

    const filePath = path.join(dir, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const name = file.replace(/\.(md|toml)$/, "");
    let cmd: Command;
    try {
      cmd = commandCache.get(filePath, (p) => {
        const content = fs.readFileSync(p, "utf-8");
        const description = isToml ? extractTomlDescription(content) : undefined;
        return {
          name,
          scope: opts.scope,
          content,
          path: p,
          description,
          pluginName: opts.scope === "plugin" ? opts.pluginName : undefined,
        };
      });
    } catch (err: unknown) {
      console.warn(`[claude-manager] Failed to read command file ${filePath}:`, (err as Error).message);
      continue;
    }
    commands.push(cmd);
  }

  return commands;
}

function readPluginCommands(plugin: ActivePlugin): Command[] {
  const out: Command[] = [];
  for (const dir of resolvePluginContentDirs(plugin, "commands", "commands")) {
    out.push(...readCommandsFromDir(dir, { scope: "plugin", pluginName: plugin.qualifiedName }));
  }
  return out;
}

/**
 * Parse all Claude Code slash commands from built-ins, the global
 * directory, the workspace directory, and every active plugin.
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 * @returns Built-ins first, then global, project, and plugin commands.
 */
export function parseCommands(workspacePath?: string): Command[] {
  const commands: Command[] = [];

  // Built-in commands shipped with Claude Code
  commands.push(...getBuiltInCommands());

  // Global commands
  commands.push(...readCommandsFromDir(GLOBAL_COMMANDS_DIR, { scope: "global" }));

  // Project commands
  if (workspacePath) {
    const projectCommandsDir = path.join(workspacePath, ".claude", "commands");
    commands.push(...readCommandsFromDir(projectCommandsDir, { scope: "project" }));
  }

  // Plugin-provided commands
  for (const plugin of loadActivePlugins(workspacePath)) {
    commands.push(...readPluginCommands(plugin));
  }

  return commands;
}
