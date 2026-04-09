/**
 * Type definitions for the MCP servers feature.
 * Covers MCP server data and extension-webview message protocol.
 */

/** Transport type for an MCP server connection. */
export type McpServerType = "stdio" | "http";

/** Scope of an MCP server configuration. */
export type McpServerScope = "global" | "project";

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
  /** Whether this server is global (~/.claude/mcp.json) or project-level (.mcp.json). */
  scope: McpServerScope;
  /** Whether the server is explicitly disabled in the config. */
  disabled?: boolean;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for the MCP feature. */
export type McpExtensionMessage =
  | { type: "mcpServers"; data: McpServer[] }
  | { type: "mcpError"; message: string };

/** Messages sent from the webview to the extension host for the MCP feature. */
export type McpWebviewMessage =
  | { type: "getMcpServers" }
  | { type: "openMcpConfig"; scope: McpServerScope }
  | { type: "toggleMcpServer"; name: string; scope: McpServerScope; disabled: boolean };
