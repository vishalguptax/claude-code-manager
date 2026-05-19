/**
 * Centralized state store for the MCP servers webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { McpServer } from "../types";

// ── Raw state ──

let allServers: McpServer[] = [];
let selectedServer: McpServer | null = null;
let loading = false;
let searchQuery = "";
let filterScope: "all" | "project" | "global" | "plugin" = "all";

// ── Getters ──

/** Return all loaded MCP servers. */
export function getAllServers(): McpServer[] {
  return allServers;
}

/** Return MCP servers filtered by scope. */
export function getServersByScope(scope: "global" | "project" | "plugin"): McpServer[] {
  return allServers.filter((s) => s.scope === scope);
}

/** Return the currently selected MCP server (if any). */
export function getSelectedServer(): McpServer | null {
  return selectedServer;
}

/** Return whether a data request is in progress. */
export function isLoading(): boolean {
  return loading;
}

/** Return the current search query (lowercase). */
export function getSearchQuery(): string {
  return searchQuery;
}

/** Return the current scope filter value. */
export function getFilterScope(): "all" | "project" | "global" | "plugin" {
  return filterScope;
}

// ── Setters ──

/** Replace the full server list with newly received data. */
export function setServers(servers: McpServer[]): void {
  allServers = servers;
}

/** Set the currently selected MCP server. */
export function setSelectedServer(server: McpServer | null): void {
  selectedServer = server;
}

/** Set the loading flag. */
export function setLoading(v: boolean): void {
  loading = v;
}

/** Set the search query string. */
export function setSearchQuery(q: string): void {
  searchQuery = q;
}

/** Set the scope filter value. */
export function setFilterScope(scope: "all" | "project" | "global" | "plugin"): void {
  filterScope = scope;
}

// ── Derived data ──

/**
 * Return MCP servers filtered by the current search query and scope filter.
 * Project servers are sorted before global servers.
 */
export function getFilteredServers(): McpServer[] {
  let list = allServers;

  if (filterScope !== "all") {
    list = list.filter((s) => s.scope === filterScope);
  }

  if (searchQuery) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery) ||
        s.type.toLowerCase().includes(searchQuery) ||
        (s.command && s.command.toLowerCase().includes(searchQuery)) ||
        (s.url && s.url.toLowerCase().includes(searchQuery)),
    );
  }

  // Stable scope priority: project → global → plugin (project owns
  // the user's current intent; plugin items are read-only and ordered
  // last so they don't bury editable rows).
  const scopeOrder: Record<McpServer["scope"], number> = { project: 0, global: 1, plugin: 2 };
  list.sort((a, b) => {
    if (a.scope !== b.scope) return scopeOrder[a.scope] - scopeOrder[b.scope];
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}
