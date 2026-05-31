/**
 * Type definitions for the MCP servers feature.
 * Covers MCP server data and extension-webview message protocol.
 */

/** Transport type for an MCP server connection. */
export type McpServerType = "stdio" | "http";

/**
 * Scope of an MCP server configuration.
 *  - `global` / `project`: editable, loaded from settings/.mcp.json
 *  - `plugin`: declared by an installed plugin (read-only)
 */
export type McpServerScope = "global" | "project" | "plugin";

/** A parsed MCP server entry from .mcp.json or ~/.claude/mcp.json. */
export interface McpServer {
  /** Server name (the key in the mcpServers object). */
  name: string;
  /** Transport type: "stdio" for command-based, "http" for URL-based. */
  type: McpServerType;
  /** Command to execute (stdio servers only). */
  command?: string;
  /** Arguments passed to the command (stdio servers only). */
  args?: string[];
  /** URL endpoint (http servers only). */
  url?: string;
  /** Environment variables passed to the server process. */
  env?: Record<string, string>;
  /** Source scope — global, project, or plugin. */
  scope: McpServerScope;
  /** Whether the server is explicitly disabled in the config. */
  disabled?: boolean;
  /**
   * Qualified plugin name (e.g. "caveman@caveman") when `scope` is
   * `"plugin"`. Undefined otherwise.
   */
  pluginName?: string;
}

// MCP postMessage shapes now live in the shared protocol
// (src/shared/protocol/messages.ts): getMcpServers, openMcpConfig,
// toggleMcpServer, deleteMcpServer (webview→host) and mcpServers (host→webview).
