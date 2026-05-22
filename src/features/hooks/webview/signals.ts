/**
 * Reactive state for the hooks webview. One module-level store keyed by
 * @preact/signals so views re-render on change without a provider tree.
 * Derived lists (search + scope filter, grouping) are `computed` so they
 * recompute only when their inputs change.
 */
import { computed, signal } from "@preact/signals";
import type { Hook, HookEvent, HookScope } from "../types";

/** Scope filter pill state — "all" plus the four concrete scopes. */
export type HookScopeFilter = "all" | HookScope;

/** All hooks received from the host, across every scope. */
export const hooks = signal<Hook[]>([]);
/** True while the initial / refresh request is in flight. */
export const loading = signal<boolean>(true);
/** Host-reported error message, or null when healthy. */
export const errorMessage = signal<string | null>(null);
/** Lowercased search query applied to event / matcher / command. */
export const searchQuery = signal<string>("");
/** Active scope filter pill. */
export const scopeFilter = signal<HookScopeFilter>("all");
/** Hook currently shown in the detail view, or null for the list. */
export const selectedHook = signal<Hook | null>(null);

/** Count of hooks in a given scope (drives the filter pill counts). */
export function countByScope(scope: HookScope): number {
  return hooks.value.filter((h) => h.scope === scope).length;
}

/**
 * Hooks after applying the scope filter then the search query. Matches
 * the query case-insensitively against event, matcher, and command.
 */
export const filteredHooks = computed<Hook[]>(() => {
  let list = hooks.value;
  const scope = scopeFilter.value;
  if (scope !== "all") {
    list = list.filter((h) => h.scope === scope);
  }
  const q = searchQuery.value;
  if (!q) return list;
  return list.filter(
    (h) =>
      h.event.toLowerCase().includes(q) ||
      h.matcher.toLowerCase().includes(q) ||
      h.command.toLowerCase().includes(q),
  );
});

/** Filtered hooks grouped by event type, preserving first-seen order. */
export const groupedHooks = computed<Array<[HookEvent, Hook[]]>>(() => {
  const groups = new Map<HookEvent, Hook[]>();
  for (const hook of filteredHooks.value) {
    const list = groups.get(hook.event) ?? [];
    list.push(hook);
    groups.set(hook.event, list);
  }
  return Array.from(groups);
});

/** Replace the full hook list (host `hooks` message). Clears any error. */
export function setHooks(next: Hook[]): void {
  hooks.value = next;
  loading.value = false;
  errorMessage.value = null;
  // If a detail view is open, re-resolve the selection against the fresh
  // list so an edited / toggled hook keeps showing updated values. A hook
  // is identified by scope + event + matcher + command.
  const sel = selectedHook.value;
  if (sel) {
    const match = next.find(
      (h) =>
        h.scope === sel.scope &&
        h.event === sel.event &&
        h.matcher === sel.matcher &&
        h.command === sel.command,
    );
    selectedHook.value = match ?? null;
  }
}

/** Record a host error and stop the loading indicator. */
export function setError(message: string): void {
  errorMessage.value = message;
  loading.value = false;
}

/** Reset all hooks signals to defaults (used on unmount / tests). */
export function resetHooksState(): void {
  hooks.value = [];
  loading.value = true;
  errorMessage.value = null;
  searchQuery.value = "";
  scopeFilter.value = "all";
  selectedHook.value = null;
}
