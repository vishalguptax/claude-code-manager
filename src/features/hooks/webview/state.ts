/**
 * Centralized state store for the hooks webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { Hook, HookEvent } from "../types";

// ── Raw state ──

let allHooks: Hook[] = [];
let loading = false;
let searchQuery = "";

// ── Getters ──

/** Return all loaded hooks. */
export function getAllHooks(): Hook[] {
  return allHooks;
}

/** Return hooks grouped by event type. */
export function getHooksByEvent(): Map<HookEvent, Hook[]> {
  const groups = new Map<HookEvent, Hook[]>();
  for (const hook of allHooks) {
    const list = groups.get(hook.event) ?? [];
    list.push(hook);
    groups.set(hook.event, list);
  }
  return groups;
}

/** Return whether a data request is in progress. */
export function isLoading(): boolean {
  return loading;
}

/** Return the current search query (lowercase). */
export function getSearchQuery(): string {
  return searchQuery;
}

// ── Setters ──

/** Replace the full hook list with newly received data. */
export function setHooks(hooks: Hook[]): void {
  allHooks = hooks;
}

/** Set the loading flag. */
export function setLoading(v: boolean): void {
  loading = v;
}

/** Set the search query string. */
export function setSearchQuery(q: string): void {
  searchQuery = q;
}

// ── Derived data ──

/**
 * Return hooks filtered by the current search query.
 * Matches against event type, matcher, and command.
 */
export function getFilteredHooks(): Hook[] {
  if (!searchQuery) return allHooks;

  return allHooks.filter(
    (h) =>
      h.event.toLowerCase().includes(searchQuery) ||
      h.matcher.toLowerCase().includes(searchQuery) ||
      h.command.toLowerCase().includes(searchQuery),
  );
}

/**
 * Return filtered hooks grouped by event type.
 */
export function getFilteredHooksByEvent(): Map<HookEvent, Hook[]> {
  const filtered = getFilteredHooks();
  const groups = new Map<HookEvent, Hook[]>();
  for (const hook of filtered) {
    const list = groups.get(hook.event) ?? [];
    list.push(hook);
    groups.set(hook.event, list);
  }
  return groups;
}
