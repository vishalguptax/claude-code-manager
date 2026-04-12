/**
 * Centralized state store for the hooks webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { Hook, HookEvent, HookScope } from "../types";

/** Active scope filter for hooks. */
export type HookScopeFilter = "all" | HookScope;

// ── Raw state ──

let allHooks: Hook[] = [];
let loading = false;
let searchQuery = "";
let filterScope: HookScopeFilter = "all";
let selectedHook: Hook | null = null;

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

/** Return the current scope filter. */
export function getFilterScope(): HookScopeFilter {
  return filterScope;
}

/** Return hooks filtered to a specific scope (no search applied). */
export function getHooksByScope(scope: HookScope): Hook[] {
  return allHooks.filter((h) => h.scope === scope);
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

/** Set the active scope filter. */
export function setFilterScope(s: HookScopeFilter): void {
  filterScope = s;
}

/** Return the currently selected hook (detail view). */
export function getSelectedHook(): Hook | null {
  return selectedHook;
}

/** Set the selected hook for detail view. */
export function setSelectedHook(h: Hook | null): void {
  selectedHook = h;
}

// ── Derived data ──

/**
 * Return hooks filtered by the current search query and scope filter.
 * Matches against event type, matcher, and command.
 */
export function getFilteredHooks(): Hook[] {
  let list = allHooks;
  if (filterScope !== "all") {
    list = list.filter((h) => h.scope === filterScope);
  }
  if (!searchQuery) return list;
  return list.filter(
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
