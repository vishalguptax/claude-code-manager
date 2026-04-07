/**
 * MCP servers list view — renders the server list grouped by scope,
 * with click-to-select navigation to the detail view.
 */

import { esc } from "../../../../webview/utils";
import {
  getAllServers,
  getServersByScope,
  getSelectedServer,
  setSelectedServer,
} from "../state";
import { renderMcpItem, bindMcpItems } from "../components/mcpItem";
import { showMcpDetail } from "./detailView";
import type { McpServer } from "../../types";

/**
 * Render the MCP servers list into the given container.
 * Groups servers by scope (project first, then global) with type badges.
 * Shows an empty state when no servers are configured.
 *
 * @param container - The DOM element to render into
 */
export function renderMcpList(container: HTMLElement): void {
  const servers = getAllServers();
  const selected = getSelectedServer();

  if (servers.length === 0) {
    container.innerHTML = `
      <div class="mcp-empty">
        <div class="mcp-empty-title">No MCP servers configured</div>
        <div class="mcp-empty-desc">
          MCP servers are defined in JSON config files:<br>
          <code>.mcp.json</code> (project root)<br>
          <code>~/.claude/mcp.json</code> (global)<br><br>
          Each server has a <code>command</code> (stdio) or <code>url</code> (http) transport.
        </div>
      </div>`;
    return;
  }

  const projectServers = getServersByScope("project");
  const globalServers = getServersByScope("global");

  let h = `<div class="mcp-list-count">${servers.length} server${servers.length !== 1 ? "s" : ""}</div>`;

  if (projectServers.length > 0) {
    h += `<div class="mcp-group-label">Project Servers</div>`;
    for (const server of projectServers) {
      h += renderMcpItem(server, selected?.name === server.name && selected?.scope === server.scope);
    }
  }

  if (globalServers.length > 0) {
    h += `<div class="mcp-group-label">Global Servers</div>`;
    for (const server of globalServers) {
      h += renderMcpItem(server, selected?.name === server.name && selected?.scope === server.scope);
    }
  }

  container.innerHTML = h;

  bindMcpItems(container, servers, (server: McpServer) => {
    setSelectedServer(server);
    showMcpDetail(container);
  });
}

/**
 * Navigate back to the MCP server list from the detail view.
 *
 * @param container - The DOM element to render the list into
 */
export function showMcpList(container: HTMLElement): void {
  setSelectedServer(null);
  renderMcpList(container);
}
