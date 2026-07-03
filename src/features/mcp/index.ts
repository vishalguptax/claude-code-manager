/**
 * MCP servers feature barrel — exports the parser, host message handler,
 * and MCP domain types.
 */
export { parseMcpServers, setProjectMcpServerDisabled, deleteMcpServer } from "./parser";
export { handleMcpMessage } from "./messageHandlers";
export type { McpHostContext } from "./messageHandlers";
export type { McpServer, McpServerType, McpServerScope } from "./types";
