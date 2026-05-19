/**
 * Centralized state store for the commands webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { Command } from "../types";

// ── Raw state ──

let allCommands: Command[] = [];
let selectedCommand: Command | null = null;
let loading = false;
let searchQuery = "";
let filterScope: "all" | "project" | "global" | "builtin" | "plugin" = "all";

// ── Getters ──

/** Return all loaded commands. */
export function getAllCommands(): Command[] {
  return allCommands;
}

/** Return commands filtered by scope. */
export function getCommandsByScope(scope: "global" | "project" | "builtin" | "plugin"): Command[] {
  return allCommands.filter((c) => c.scope === scope);
}

/** Return the currently selected command (if any). */
export function getSelectedCommand(): Command | null {
  return selectedCommand;
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
export function getFilterScope(): "all" | "project" | "global" | "builtin" | "plugin" {
  return filterScope;
}

// ── Setters ──

/** Replace the full command list with newly received data. */
export function setCommands(commands: Command[]): void {
  allCommands = commands;
}

/** Set the currently selected command. */
export function setSelectedCommand(cmd: Command | null): void {
  selectedCommand = cmd;
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
export function setFilterScope(scope: "all" | "project" | "global" | "builtin" | "plugin"): void {
  filterScope = scope;
}

// ── Derived data ──

/** Sort priority for command scopes. Built-ins → project → global → plugin. */
const SCOPE_ORDER: Record<Command["scope"], number> = {
  builtin: 0,
  project: 1,
  global: 2,
  plugin: 3,
};

/**
 * Return commands filtered by the current search query and scope filter.
 * Built-in commands are listed first, followed by project, then global.
 */
export function getFilteredCommands(): Command[] {
  let list = allCommands;

  if (filterScope !== "all") {
    list = list.filter((c) => c.scope === filterScope);
  }

  if (searchQuery) {
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery) ||
        c.content.toLowerCase().includes(searchQuery) ||
        (c.description ?? "").toLowerCase().includes(searchQuery),
    );
  }

  list = [...list].sort((a, b) => {
    if (a.scope !== b.scope) {
      return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    }
    // Within the plugin bucket, keep each plugin's commands contiguous.
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });

  return list;
}
