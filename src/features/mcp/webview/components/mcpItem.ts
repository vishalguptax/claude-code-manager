/**
 * MCP server item component — renders a single MCP server row in the list.
 */

import { esc } from "../../../../webview/utils";
import type { McpServer } from "../../types";

/**
 * Render a single MCP server list item as an HTML string.
 * Shows the server name, type badge (stdio/http), and scope badge.
 *
 * @param server - The MCP server to render
 * @param isActive - Whether this server is currently selected
 * @returns HTML string for the MCP server item
 */
export function renderMcpItem(server: McpServer, isActive: boolean): string {
  const detail = server.type === "http"
    ? server.url || ""
    : [server.command, ...(server.args || [])].join(" ");

  const detailPreview = detail.length > 60
    ? detail.slice(0, 60) + "..."
    : detail;

  return `
    <div class="mcp-item ${isActive ? "active" : ""}" data-mcp-name="${esc(server.name)}" data-mcp-scope="${server.scope}">
      <div class="mcp-item-row1">
        <span class="mcp-item-name">${esc(server.name)}</span>
        <span class="mcp-type-badge mcp-type-${server.type}">${server.type}</span>
      </div>
      <div class="mcp-item-detail">${esc(detailPreview)}</div>
    </div>`;
}

/**
 * Bind click handlers on MCP server items in a container.
 *
 * @param container - The DOM element containing MCP server items
 * @param servers - The full list of servers (used for lookup)
 * @param onSelect - Callback when a server is selected
 */
export function bindMcpItems(
  container: HTMLElement,
  servers: McpServer[],
  onSelect: (server: McpServer) => void,
): void {
  container.querySelectorAll(".mcp-item").forEach((el) => {
    el.addEventListener("click", () => {
      const name = (el as HTMLElement).dataset.mcpName;
      const scope = (el as HTMLElement).dataset.mcpScope;
      const server = servers.find((s) => s.name === name && s.scope === scope);
      if (server) onSelect(server);
    });
  });
}
