/**
 * Reactive state for the MCP servers tab. Replaces the vanilla module-level
 * mutable store with @preact/signals so views re-render on change.
 *
 * State is intentionally minimal: the raw server list, the current selection,
 * a loading flag, plus the search query and scope filter. Derived data
 * (filtered + grouped lists) is computed in `computed` signals so views never
 * recompute filtering inline.
 */
import { computed, signal } from "@preact/signals";
import type { McpServer, McpServerScope } from "../../types";

/** Scope filter value — "all" plus the three real scopes. */
export type McpScopeFilter = "all" | McpServerScope;

/** All servers as last received from the host. */
export const servers = signal<McpServer[]>([]);

/** Server names Claude Code flagged as needing (re-)authentication. */
export const authNeeds = signal<string[]>([]);

/** Currently selected server (drives the detail view), or null for the list. */
export const selected = signal<McpServer | null>(null);

/** True while the initial server list request is in flight. */
export const loading = signal<boolean>(true);

/** Host-reported error message, or null when healthy. */
export const errorMessage = signal<string | null>(null);

/** Lowercased free-text search query. */
export const searchQuery = signal<string>("");

/** Active scope filter. */
export const scopeFilter = signal<McpScopeFilter>("all");

/** Count of servers in a given scope (unfiltered by search). */
export const scopeCounts = computed(() => {
  const counts = { project: 0, global: 0, plugin: 0 };
  for (const s of servers.value) counts[s.scope]++;
  return counts;
});

/**
 * Servers after applying the scope filter and search query, sorted with a
 * stable scope priority (project → global → plugin) so editable rows sit
 * above read-only plugin rows. Mirrors the vanilla `getFilteredServers`.
 */
export const filteredServers = computed<McpServer[]>(() => {
  const query = searchQuery.value;
  const scope = scopeFilter.value;
  let list = servers.value;

  if (scope !== "all") list = list.filter((s) => s.scope === scope);

  if (query) {
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.type.toLowerCase().includes(query) ||
        (s.command?.toLowerCase().includes(query) ?? false) ||
        (s.url?.toLowerCase().includes(query) ?? false),
    );
  }

  const scopeOrder: Record<McpServerScope, number> = { project: 0, global: 1, plugin: 2 };
  return [...list].sort((a, b) => {
    if (a.scope !== b.scope) return scopeOrder[a.scope] - scopeOrder[b.scope];
    if (a.scope === "plugin" && a.pluginName !== b.pluginName) {
      return (a.pluginName ?? "").localeCompare(b.pluginName ?? "");
    }
    return a.name.localeCompare(b.name);
  });
});

/**
 * Replace the server list, clear loading, and reconcile the current
 * selection: if the selected server still exists (matched by name + scope)
 * its reference is refreshed to the new data; otherwise the selection is
 * dropped so the detail view falls back to the list.
 */
export function applyServers(next: McpServer[]): void {
  servers.value = next;
  loading.value = false;
  errorMessage.value = null;
  const sel = selected.value;
  if (sel) {
    const updated = next.find((s) => s.name === sel.name && s.scope === sel.scope);
    selected.value = updated ?? null;
  }
}

/** Apply the auth-needs list from the host (sorted server names). */
export function applyAuthNeeds(next: string[]): void {
  authNeeds.value = next;
}

/** Record a host error and stop the loading state. */
export function applyError(message: string): void {
  errorMessage.value = message;
  loading.value = false;
}

/** Reset all signals to their initial values. Used on unmount + in tests. */
export function resetMcpSignals(): void {
  servers.value = [];
  authNeeds.value = [];
  selected.value = null;
  loading.value = true;
  errorMessage.value = null;
  searchQuery.value = "";
  scopeFilter.value = "all";
}
