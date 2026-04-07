/**
 * MCP server parsing — reads MCP server configurations from project-level
 * .mcp.json and global ~/.claude/mcp.json files.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { McpServer, McpServerType } from "./types";

/** Global MCP config file: ~/.claude/mcp.json */
const GLOBAL_MCP_FILE: string = path.join(os.homedir(), ".claude", "mcp.json");

/**
 * Read and parse MCP servers from a single JSON config file.
 * Returns an empty array if the file does not exist or cannot be parsed.
 *
 * @param filePath - Absolute path to the .mcp.json or mcp.json file
 * @param scope - Whether these are "global" or "project" servers
 * @returns Array of parsed McpServer objects
 */
function readMcpServersFromFile(filePath: string, scope: "global" | "project"): McpServer[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[claude-manager] Failed to read MCP config ${filePath}:`, (err as Error).message);
    }
    return [];
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    console.warn(`[claude-manager] Failed to parse MCP config ${filePath}:`, (err as Error).message);
    return [];
  }

  const mcpServers = config.mcpServers;
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    return [];
  }

  const servers: McpServer[] = [];
  const serversMap = mcpServers as Record<string, unknown>;

  for (const [name, entry] of Object.entries(serversMap)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const rec = entry as Record<string, unknown>;
    const explicitType = typeof rec.type === "string" ? rec.type : undefined;
    const command = typeof rec.command === "string" ? rec.command : undefined;
    const url = typeof rec.url === "string" ? rec.url : undefined;
    const args = Array.isArray(rec.args)
      ? (rec.args as unknown[]).filter((a): a is string => typeof a === "string")
      : undefined;
    const env = rec.env && typeof rec.env === "object" && !Array.isArray(rec.env)
      ? Object.fromEntries(
          Object.entries(rec.env as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string]),
        )
      : undefined;

    // Determine server type: explicit type field, or infer from presence of url vs command
    let serverType: McpServerType;
    if (explicitType === "http" || (!command && url)) {
      serverType = "http";
    } else {
      serverType = "stdio";
    }

    servers.push({
      name,
      type: serverType,
      command,
      args,
      url,
      env: env && Object.keys(env).length > 0 ? env : undefined,
      scope,
    });
  }

  return servers;
}

/**
 * Parse all MCP servers from both project-level (.mcp.json in workspace root)
 * and global (~/.claude/mcp.json) configuration files.
 *
 * @param workspacePath - Absolute path to the current VS Code workspace folder (optional)
 * @returns Array of all discovered McpServer objects, project servers first
 */
export function parseMcpServers(workspacePath?: string): McpServer[] {
  const servers: McpServer[] = [];

  // Project-level MCP servers (.mcp.json in project root)
  if (workspacePath) {
    const projectMcpFile = path.join(workspacePath, ".mcp.json");
    servers.push(...readMcpServersFromFile(projectMcpFile, "project"));
  }

  // Global MCP servers (~/.claude/mcp.json)
  servers.push(...readMcpServersFromFile(GLOBAL_MCP_FILE, "global"));

  return servers;
}
