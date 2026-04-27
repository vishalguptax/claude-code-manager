/**
 * Agent parsing — reads Claude Code agent files from .claude/agents/ in the
 * current workspace, parses YAML frontmatter for name, description, and model.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { createMtimeCache } from "../../core/mtimeCache";
import type { Agent } from "./types";

/** Cache parsed Agent objects by their .md path. */
const agentCache = createMtimeCache<Agent>();

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

/**
 * Parse all agents from .claude/agents/ in the given workspace directory.
 * Each .md file in the directory is treated as an agent definition with
 * YAML frontmatter containing name, description, and model fields.
 *
 * @param workspacePath - Absolute path to the current workspace folder (optional).
 *   When not provided, returns an empty array.
 * @returns Array of all discovered Agent objects
 */
export function parseAgents(workspacePath?: string): Agent[] {
  if (!workspacePath) {
    return [];
  }

  const agentsDir = path.join(workspacePath, ".claude", "agents");

  let files: string[];
  try {
    files = fs.readdirSync(agentsDir);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read agents directory ${agentsDir}:`, (err as Error).message);
    }
    return [];
  }

  const agents: Agent[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const filePath = path.join(agentsDir, file);
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
