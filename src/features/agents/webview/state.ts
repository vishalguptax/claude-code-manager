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
