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
let filterScope: "all" | "project" | "global" = "all";

// ── Getters ──

/** Return all loaded MCP servers. */
export function getAllServers(): McpServer[] {
  return allServers;
}

/** Return MCP servers filtered by scope. */
export function getServersByScope(scope: "global" | "project"): McpServer[] {
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
export function getFilterScope(): "all" | "project" | "global" {
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
export function setFilterScope(scope: "all" | "project" | "global"): void {
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

  list.sort((a, b) => {
    if (a.scope !== b.scope) {
      return a.scope === "project" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}
