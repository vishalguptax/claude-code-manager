/**
 * Centralized state store for the hooks webview.
 * All mutable state lives here. Other modules read via getters
 * and mutate via explicit setter functions so changes are easy to trace.
 */

import type { Hook, HookEvent } from "../types";

// ── Raw state ──

let allHooks: Hook[] = [];
let loading = false;

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

// ── Setters ──

/** Replace the full hook list with newly received data. */
export function setHooks(hooks: Hook[]): void {
  allHooks = hooks;
}

/** Set the loading flag. */
export function setLoading(v: boolean): void {
  loading = v;
}
