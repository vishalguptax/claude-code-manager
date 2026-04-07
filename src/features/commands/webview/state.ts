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

// ── Getters ──

/** Return all loaded commands. */
export function getAllCommands(): Command[] {
  return allCommands;
}

/** Return commands filtered by scope. */
export function getCommandsByScope(scope: "global" | "project"): Command[] {
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
