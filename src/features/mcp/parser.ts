/**
 * MCP server parsing — reads MCP server configurations from project-level
 * .mcp.json and global ~/.claude/mcp.json files.
 * Pure Node.js file I/O, no VS Code dependency.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { MCP_AUTH_CACHE_FILE } from "../../core/config";
import { createMtimeCache } from "../../core/mtimeCache";
import { loadActivePlugins, findPluginMcpFile, type ActivePlugin } from "../../core/plugins";
import type { McpServer, McpServerScope, McpServerType } from "./types";

/** Cache parsed `McpServer[]` keyed by config file path. */
const mcpCache = createMtimeCache<McpServer[]>();

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
interface McpReadOpts {
  scope: McpServerScope;
  pluginName?: string;
}

/**
 * Convert the raw `mcpServers` object (whatever its source — a JSON
 * file or an inline manifest block) into McpServer[] tagged with the
 * given scope.
 */
function buildServersFromBlock(
  mcpServers: unknown,
  opts: McpReadOpts,
): McpServer[] {
  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    return [];
  }
  const servers: McpServer[] = [];
  const serversMap = mcpServers as Record<string, unknown>;
  for (const [name, entry] of Object.entries(serversMap)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const rec = entry as Record<string, unknown>;
    const explicitType = typeof rec.type === "string" ? rec.type : undefined;
    const disabled = rec.disabled === true;
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
      scope: opts.scope,
      disabled: disabled || undefined,
      pluginName: opts.scope === "plugin" ? opts.pluginName : undefined,
    });
  }
  return servers;
}

function readMcpServersFromFile(filePath: string, opts: McpReadOpts): McpServer[] {
  return mcpCache.get(filePath, (p) => {
    let raw: string;
    try {
      raw = fs.readFileSync(p, "utf-8");
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[claude-manager] Failed to read MCP config ${p}:`, (err as Error).message);
      }
      return [];
    }

    let config: Record<string, unknown>;
    try {
      config = JSON.parse(raw) as Record<string, unknown>;
    } catch (err: unknown) {
      console.warn(`[claude-manager] Failed to parse MCP config ${p}:`, (err as Error).message);
      return [];
    }

    return buildServersFromBlock(config.mcpServers, opts);
  });
}

/**
 * Read MCP servers contributed by a single plugin.
 *
 * Order of precedence:
 *  1. `manifest.mcpServers` (inline) — wins if present.
 *  2. `<plugin>/.mcp.json` (preferred file form).
 *  3. `<plugin>/mcp.json` (alternative file form).
 *
 * Only one source is used per plugin; inline + file would otherwise
 * duplicate entries by name. The inline form mirrors what claude-code
 * itself loads from the manifest.
 */
function readPluginMcpServers(plugin: ActivePlugin): McpServer[] {
  const opts: McpReadOpts = { scope: "plugin", pluginName: plugin.qualifiedName };
  if (plugin.manifest.mcpServers && typeof plugin.manifest.mcpServers === "object") {
    return buildServersFromBlock(plugin.manifest.mcpServers, opts);
  }
  const file = findPluginMcpFile(plugin);
  if (!file) return [];
  return readMcpServersFromFile(file, opts);
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
    servers.push(...readMcpServersFromFile(projectMcpFile, { scope: "project" }));
  }

  // Global MCP servers (~/.claude/mcp.json)
  servers.push(...readMcpServersFromFile(GLOBAL_MCP_FILE, { scope: "global" }));

  // Plugin-provided MCP servers (read-only).
  for (const plugin of loadActivePlugins(workspacePath)) {
    servers.push(...readPluginMcpServers(plugin));
  }

  return servers;
}

/**
 * List MCP servers Claude Code has flagged as needing (re-)auth. Keys
 * of `mcp-needs-auth-cache.json` are the connector display names Claude
 * uses ("claude.ai Gmail", …). Returns a sorted array; absent file or
 * parse failure → empty array (no badge).
 */
export function readMcpAuthNeeds(): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(MCP_AUTH_CACHE_FILE, "utf-8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  return Object.keys(parsed as Record<string, unknown>).sort();
}

/**
 * Toggle the `disabled` field of an MCP server in its config file.
 * Reads the JSON, sets `"disabled": true` or removes the key, and writes back.
 *
 * @param name - The server name (key in mcpServers)
 * @param scope - Which config file to modify
 * @param disabled - Whether to disable (true) or enable (false)
 * @param workspacePath - Workspace path (needed for project scope)
 * @returns true if the write succeeded
 */
export function toggleMcpServer(
  name: string,
  scope: McpServerScope,
  disabled: boolean,
  workspacePath?: string,
): boolean {
  // Plugin-supplied MCP servers live inside a plugin's install dir
  // (or its manifest). They are read-only from the sidebar.
  if (scope === "plugin") return false;
  const filePath = scope === "project" && workspacePath
    ? path.join(workspacePath, ".mcp.json")
    : GLOBAL_MCP_FILE;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return false;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const servers = config.mcpServers as Record<string, Record<string, unknown>> | undefined;
  if (!servers || !servers[name]) return false;

  if (disabled) {
    servers[name].disabled = true;
  } else {
    delete servers[name].disabled;
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete an MCP server entry from its config file.
 *
 * @param name - The server name (key in mcpServers)
 * @param scope - Which config file to modify
 * @param workspacePath - Workspace path (needed for project scope)
 * @returns true if the write succeeded
 */
export function deleteMcpServer(
  name: string,
  scope: McpServerScope,
  workspacePath?: string,
): boolean {
  if (scope === "plugin") return false;
  const filePath = scope === "project" && workspacePath
    ? path.join(workspacePath, ".mcp.json")
    : GLOBAL_MCP_FILE;

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return false;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return false;
  }

  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers || !(name in servers)) return false;

  delete servers[name];

  try {
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}
