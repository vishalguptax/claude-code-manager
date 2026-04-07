/**
 * Centralized state store for the agents webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { Agent } from "../types";

// ── Raw state ──

let allAgents: Agent[] = [];
let selectedAgent: Agent | null = null;
let loading = false;
let searchQuery = "";
let filterModel: "all" | "sonnet" | "opus" | "haiku" = "all";

// ── Getters ──

/** Return all loaded agents. */
export function getAllAgents(): Agent[] {
  return allAgents;
}

/** Return the currently selected agent (if any). */
export function getSelectedAgent(): Agent | null {
  return selectedAgent;
}

/** Return whether a data request is in progress. */
export function isLoading(): boolean {
  return loading;
}

/** Return the current search query (lowercase). */
export function getSearchQuery(): string {
  return searchQuery;
}

/** Return the current model filter value. */
export function getFilterModel(): "all" | "sonnet" | "opus" | "haiku" {
  return filterModel;
}

/** Return agents filtered by a specific model. */
export function getAgentsByModel(model: string): Agent[] {
  return allAgents.filter((a) => a.model.toLowerCase().includes(model.toLowerCase()));
}

// ── Setters ──

/** Replace the full agent list with newly received data. */
export function setAgents(agents: Agent[]): void {
  allAgents = agents;
}

/** Set the currently selected agent. */
export function setSelectedAgent(agent: Agent | null): void {
  selectedAgent = agent;
}

/** Set the loading flag. */
export function setLoading(v: boolean): void {
  loading = v;
}

/** Set the search query string. */
export function setSearchQuery(q: string): void {
  searchQuery = q;
}

/** Set the model filter value. */
export function setFilterModel(model: "all" | "sonnet" | "opus" | "haiku"): void {
  filterModel = model;
}

// ── Derived data ──

/**
 * Return agents filtered by the current search query and model filter.
 * Sorted alphabetically by name.
 */
export function getFilteredAgents(): Agent[] {
  let list = allAgents;

  if (filterModel !== "all") {
    list = list.filter((a) => a.model.toLowerCase().includes(filterModel));
  }

  if (searchQuery) {
    list = list.filter(
      (a) =>
        a.name.toLowerCase().includes(searchQuery) ||
        a.description.toLowerCase().includes(searchQuery) ||
        a.model.toLowerCase().includes(searchQuery),
    );
  }

  list.sort((a, b) => a.name.localeCompare(b.name));

  return list;
}
