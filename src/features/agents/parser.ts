/**
 * Agent parsing — reads Claude Code agent files from `.claude/agents/`
 * across global, project, and plugin scopes. Parses YAML frontmatter
 * for name, description, and model. Pure Node.js file I/O, no VS Code
 * dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, resolvePluginContentDirs, type ActivePlugin } from "../../core/plugins";
import type { Agent, AgentScope } from "./types";

/** Cache parsed Agent objects by their .md path. */
const agentCache = createMtimeCache<Agent>();

/** Global agents directory (~/.claude/agents/). */
const GLOBAL_AGENTS_DIR: string = path.join(os.homedir(), ".claude", "agents");

/**
 * Parse YAML frontmatter from an agent .md file content string.
 * Handles simple key-value pairs for name, description, and model.
 *
 * @param raw - Raw file content of the agent .md file
 * @returns Parsed frontmatter fields and markdown body
 */
function parseFrontmatter(raw: string): { name: string; description: string; model: string; body: string } {
  const result = { name: "", description: "", model: "", body: raw };

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return result;
  }

  const yaml = match[1];
  result.body = match[2];

  for (const line of yaml.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      if (key === "name") {
        result.name = value;
      } else if (key === "description") {
        result.description = value;
      } else if (key === "model") {
        result.model = value;
      }
    }
  }

  return result;
}

interface ReadAgentsOpts {
  scope: AgentScope;
  /** Qualified plugin name when `scope === "plugin"`. */
  pluginName?: string;
}

/**
 * Read all .md agent files from a directory.
 *
 * @param dir - Absolute path to the agents directory
 * @param opts - Scope and (for plugins) the source plugin name
 */
function readAgentsFromDir(dir: string, opts: ReadAgentsOpts): Agent[] {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read agents directory ${dir}:`, (err as Error).message);
    }
    return [];
  }

  const agents: Agent[] = [];
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

    let agent: Agent;
    try {
      agent = agentCache.get(filePath, (p) => {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = parseFrontmatter(raw);
        return {
          name: parsed.name || file.replace(/\.md$/, ""),
          description: parsed.description,
          model: parsed.model || "sonnet",
          path: p,
          content: raw,
          scope: opts.scope,
          pluginName: opts.scope === "plugin" ? opts.pluginName : undefined,
        };
      });
    } catch (err: unknown) {
      console.warn(`[claude-manager] Failed to read agent file ${filePath}:`, (err as Error).message);
      continue;
    }
    agents.push(agent);
  }

  return agents;
}

function readPluginAgents(plugin: ActivePlugin): Agent[] {
  const out: Agent[] = [];
  for (const dir of resolvePluginContentDirs(plugin, "agents", "agents")) {
    out.push(...readAgentsFromDir(dir, { scope: "plugin", pluginName: plugin.qualifiedName }));
  }
  return out;
}

/**
 * Parse all agents available in the current context:
 *  - global agents from `~/.claude/agents/`
 *  - project agents from `<workspace>/.claude/agents/`
 *  - plugin agents declared by every active plugin
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 * @returns Array of all discovered Agent objects (global → project → plugin).
 */
export function parseAgents(workspacePath?: string): Agent[] {
  const agents: Agent[] = [];

  // Global
  agents.push(...readAgentsFromDir(GLOBAL_AGENTS_DIR, { scope: "global" }));

  // Project
  if (workspacePath) {
    const projectAgentsDir = path.join(workspacePath, ".claude", "agents");
    agents.push(...readAgentsFromDir(projectAgentsDir, { scope: "project" }));
  }

  // Plugin-provided
  for (const plugin of loadActivePlugins(workspacePath)) {
    agents.push(...readPluginAgents(plugin));
  }

  return agents;
}
