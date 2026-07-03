/**
 * Type definitions for the MCP servers feature.
 * Covers MCP server data and extension-webview message protocol.
 */

/**
 * Transport type for an MCP server connection. `sse` is deprecated by
 * Claude Code (superseded by `http`) but still a valid, live config
 * value — shown as-is rather than coerced into something else.
 */
export type McpServerType = "stdio" | "http" | "sse" | "ws";

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
  /** HTTP headers sent with each request (http/sse/ws servers only). */
  headers?: Record<string, string>;
  /** Source scope — global, project, or plugin. */
  scope: McpServerScope;
  /** Whether the server is explicitly disabled in the config. */
  disabled?: boolean;
  /**
   * Qualified plugin name (e.g. "caveman@caveman") when `scope` is
   * `"plugin"`. Undefined otherwise.
   */
  pluginName?: string;
  /**
   * For stdio servers, whether the launch command resolves on the
   * user's PATH (a local, offline health signal). `undefined` for
   * url-transport servers, whose reachability the extension never
   * probes (no network) — their status is checked via `claude mcp list`.
   */
  commandAvailable?: boolean;
}

// MCP postMessage shapes now live in the shared protocol
// (src/shared/protocol/messages.ts): getMcpServers, openMcpConfig,
// toggleMcpServer, deleteMcpServer (webview→host) and mcpServers (host→webview).
