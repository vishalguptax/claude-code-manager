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
