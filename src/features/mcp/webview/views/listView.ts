/**
 * MCP servers list view — renders the server list with search and scope filter,
 * grouped by scope, with click-to-select navigation to the detail view.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendGetMcpServers } from "../api";
import {
  getAllServers,
  getFilteredServers,
  getServersByScope,
  getSearchQuery,
  getFilterScope,
  getSelectedServer,
  setSelectedServer,
  setSearchQuery,
  setFilterScope,
} from "../state";
import { renderMcpItem, bindMcpItems } from "../components/mcpItem";
import { showMcpDetail } from "./detailView";
import type { McpServer } from "../../types";

let _searchTimer: ReturnType<typeof setTimeout>;

/**
 * Render the MCP servers list into the given container.
 * Includes a search bar, scope filter buttons, refresh button, and server items
 * grouped by scope (project first, then global).
 * Shows an empty state when no servers are configured.
 *
 * @param container - The DOM element to render into
 */
export function renderMcpList(container: HTMLElement): void {
  const servers = getAllServers();
  const searchQuery = getSearchQuery();
  const scope = getFilterScope();

  const projectCount = getServersByScope("project").length;
  const globalCount = getServersByScope("global").length;

  let shell = `
    <div class="actions-bar">
      <button class="action-btn icon-only" id="mcpRefresh" title="Refresh MCP servers">${icon("refresh-cw")}</button>
    </div>
    <div class="feature-search">
      <input id="mcpSearch" type="text" placeholder="Search servers..." value="${esc(searchQuery)}" />
      <div class="search-actions">
        <button class="search-btn ${searchQuery ? "" : "is-hidden"}" id="mcpSearchClear" title="Clear (Esc)">${icon("x", 14)}</button>
      </div>
    </div>`;

  if (servers.length > 0) {
    shell += `
    <div class="scope-filter" id="mcpScopeFilter">
      <button class="scope-btn ${scope === "all" ? "active" : ""}" data-scope="all">All (${servers.length})</button>
      <button class="scope-btn ${scope === "project" ? "active" : ""}" data-scope="project">Project (${projectCount})</button>
      <button class="scope-btn ${scope === "global" ? "active" : ""}" data-scope="global">Global (${globalCount})</button>
    </div>`;
  }

  shell += `<div id="mcpListInner"></div>`;
  container.innerHTML = shell;

  // Bind search
  const searchInput = container.querySelector("#mcpSearch") as HTMLInputElement | null;
  const clearBtn = container.querySelector("#mcpSearchClear");

  searchInput?.addEventListener("input", () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.toLowerCase();
      setSearchQuery(q);
      clearBtn?.classList.toggle("is-hidden", !q);
      updateMcpListInner(container);
    }, 150);
  });

  searchInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      setSearchQuery("");
      clearBtn?.classList.add("is-hidden");
      updateMcpListInner(container);
      searchInput.focus();
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    setSearchQuery("");
    clearBtn?.classList.add("is-hidden");
    updateMcpListInner(container);
    searchInput?.focus();
  });

  // Bind scope filter
  container.querySelector("#mcpScopeFilter")?.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = (btn as HTMLElement).dataset.scope as "all" | "project" | "global";
      if (value) {
        setFilterScope(value);
        renderMcpList(container);
      }
    });
  });

  // Bind refresh
  container.querySelector("#mcpRefresh")?.addEventListener("click", () => sendGetMcpServers());

  // Render inner list
  updateMcpListInner(container);
}

/**
 * Update just the inner MCP list items without rebuilding the full shell.
 * @param container - The parent DOM element containing #mcpListInner
 */
function updateMcpListInner(container: HTMLElement): void {
  const inner = container.querySelector("#mcpListInner");
  if (!inner) return;

  const allServers = getAllServers();
  const filtered = getFilteredServers();
  const selected = getSelectedServer();
  const searchQuery = getSearchQuery();

  if (allServers.length === 0) {
    inner.innerHTML = `
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

  if (filtered.length === 0) {
    inner.innerHTML = `<div class="empty">${searchQuery ? "No matching servers" : "No servers found"}</div>`;
    return;
  }

  // Group by scope
  const groups = new Map<string, McpServer[]>();
  for (const server of filtered) {
    const label = server.scope === "project" ? "Project Servers" : "Global Servers";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(server);
  }

  let h = `<div class="mcp-list-count">${filtered.length} server${filtered.length !== 1 ? "s" : ""}</div>`;

  for (const [label, servers] of groups) {
    h += `<div class="mcp-group-label">${esc(label)}</div>`;
    for (const server of servers) {
      h += renderMcpItem(server, selected?.name === server.name && selected?.scope === server.scope);
    }
  }

  inner.innerHTML = h;

  bindMcpItems(inner as HTMLElement, filtered, (server: McpServer) => {
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
