/**
 * MCP server item component — renders a single MCP server row in the list.
 */

import { icon } from "../../../../webview/icons";
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

  // Plugin items expose their qualified plugin name so that two
  // plugins shipping a server with the same `name` resolve to the
  // right entry on click. Settings-scoped items don't have a plugin
  // owner and use the empty string as a stable placeholder.
  const pluginKey = server.pluginName ?? "";
  const readOnlyBadge = server.scope === "plugin"
    ? `<span class="mcp-readonly-badge" title="Owned by plugin ${esc(pluginKey)}">read-only</span>`
    : "";

  return `
    <div class="mcp-item ${isActive ? "active" : ""} ${server.disabled ? "mcp-disabled" : ""}" data-mcp-name="${esc(server.name)}" data-mcp-scope="${server.scope}" data-mcp-plugin="${esc(pluginKey)}">
      <div class="mcp-item-row1">
        <span class="mcp-item-name">${esc(server.name)}</span>
        <button class="item-copy-btn" data-copy-name="${esc(server.name)}" title="Copy name">${icon("copy", 14)}</button>
        ${server.disabled ? `<span class="mcp-disabled-badge">disabled</span>` : ""}
        <span class="mcp-type-badge mcp-type-${server.type}">${server.type}</span>
        ${readOnlyBadge}
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
/**
 * Bind click handlers on MCP server items using event delegation.
 */
export function bindMcpItems(
  container: HTMLElement,
  servers: McpServer[],
  onSelect: (server: McpServer) => void,
): void {
  container.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    // Copy button
    const copyBtn = target.closest(".item-copy-btn") as HTMLElement | null;
    if (copyBtn) {
      e.stopPropagation();
      const name = copyBtn.dataset.copyName;
      if (name) {
        navigator.clipboard?.writeText(name);
        copyBtn.classList.add("copied");
        setTimeout(() => copyBtn.classList.remove("copied"), 1000);
      }
      return;
    }

    // MCP item click — disambiguate by (name, scope, pluginName) so
    // two plugins shipping a server with the same name resolve
    // correctly. For non-plugin scopes pluginName is the empty
    // string on both sides, and the original (name, scope) match
    // still wins.
    const item = target.closest(".mcp-item") as HTMLElement | null;
    if (item) {
      const name = item.dataset.mcpName;
      const scope = item.dataset.mcpScope;
      const plugin = item.dataset.mcpPlugin ?? "";
      const server = servers.find(
        (s) => s.name === name && s.scope === scope && (s.pluginName ?? "") === plugin,
      );
      if (server) onSelect(server);
    }
  });
}
