/**
 * Agent parsing — reads Claude Code agent files from `.claude/agents/`
 * across global, project, and plugin scopes. Parses YAML frontmatter
 * (via the shared core parser) for name, description, model, tools,
 * and skills. Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createMtimeCache } from "../../core/mtimeCache";
import { parseFrontmatter, fmString, fmList } from "../../core/frontmatter";
import { loadActivePlugins, resolvePluginContentDirs, type ActivePlugin } from "../../core/plugins";
import type { Agent, AgentScope } from "./types";

/** Agents parsed from every scope, plus any per-file/dir parse failures. */
export interface AgentsParseResult {
  agents: Agent[];
  errors: string[];
}

/** Cache parsed Agent objects by their .md path. */
const agentCache = createMtimeCache<Agent>();

/** Global agents directory (~/.claude/agents/). */
const GLOBAL_AGENTS_DIR: string = path.join(os.homedir(), ".claude", "agents");

/**
 * Read a frontmatter field as a list, also accepting a comma-separated
 * scalar (`tools: Read, Grep`) — a common shorthand the block/flow
 * list forms don't cover.
 */
function fieldAsList(fm: ReturnType<typeof parseFrontmatter>, key: string): string[] | undefined {
  const list = fmList(fm, key);
  if (list) return list.length > 0 ? list : undefined;
  const scalar = fmString(fm, key);
  if (!scalar) return undefined;
  const parts = scalar.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

interface ReadAgentsOpts {
  scope: AgentScope;
  /** Qualified plugin name when `scope === "plugin"`. */
  pluginName?: string;
}

interface DirReadResult {
  agents: Agent[];
  error?: string;
}

/**
 * Read all .md agent files from a directory.
 *
 * @param dir - Absolute path to the agents directory
 * @param opts - Scope and (for plugins) the source plugin name
 */
function readAgentsFromDir(dir: string, opts: ReadAgentsOpts): DirReadResult {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { agents: [] };
    const message = (err as Error).message;
    console.warn(`[claude-manager] Failed to read agents directory ${dir}:`, message);
    return { agents: [], error: `Failed to read agents directory ${dir}: ${message}` };
  }

  const agents: Agent[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (!file.toLowerCase().endsWith(".md")) continue;

    const filePath = path.join(dir, file);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    try {
      const agent = agentCache.get(filePath, (p) => {
        const raw = fs.readFileSync(p, "utf-8");
        const fm = parseFrontmatter(raw);
        return {
          name: fmString(fm, "name") || file.replace(/\.md$/i, ""),
          description: fmString(fm, "description") ?? "",
          // No model in frontmatter → the agent inherits the main
          // conversation's model. Represent that truthfully instead of
          // fabricating "sonnet".
          model: fmString(fm, "model") || "inherit",
          tools: fieldAsList(fm, "tools"),
          skills: fieldAsList(fm, "skills"),
          path: p,
          content: raw,
          scope: opts.scope,
          pluginName: opts.scope === "plugin" ? opts.pluginName : undefined,
        };
      });
      agents.push(agent);
    } catch (err: unknown) {
      const message = (err as Error).message;
      console.warn(`[claude-manager] Failed to read agent file ${filePath}:`, message);
      errors.push(`Failed to read agent ${filePath}: ${message}`);
    }
  }

  return { agents, error: errors.length > 0 ? errors.join("; ") : undefined };
}

function readPluginAgents(plugin: ActivePlugin): Agent[] {
  const out: Agent[] = [];
  for (const dir of resolvePluginContentDirs(plugin, "agents", "agents")) {
    // Plugin content is validated at install time by Claude Code, so a
    // parse failure here is a plugin-install problem — not surfaced as a
    // settings-style error (same policy as hooks/mcp plugin content).
    out.push(...readAgentsFromDir(dir, { scope: "plugin", pluginName: plugin.qualifiedName }).agents);
  }
  return out;
}

/**
 * Parse all agents available in the current context:
 *  - global agents from `~/.claude/agents/`
 *  - project agents from `<workspace>/.claude/agents/`
 *  - plugin agents declared by every active plugin
 *
 * A directory or file that fails to read contributes an error string
 * (naming the path) instead of aborting the whole parse.
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 */
export function parseAgents(workspacePath?: string): AgentsParseResult {
  const agents: Agent[] = [];
  const errors: string[] = [];

  const collect = (result: DirReadResult): void => {
    agents.push(...result.agents);
    if (result.error) errors.push(result.error);
  };

  // Global
  collect(readAgentsFromDir(GLOBAL_AGENTS_DIR, { scope: "global" }));

  // Project
  if (workspacePath) {
    const projectAgentsDir = path.join(workspacePath, ".claude", "agents");
    collect(readAgentsFromDir(projectAgentsDir, { scope: "project" }));
  }

  // Plugin-provided
  for (const plugin of loadActivePlugins(workspacePath)) {
    agents.push(...readPluginAgents(plugin));
  }

  return { agents, errors };
}
