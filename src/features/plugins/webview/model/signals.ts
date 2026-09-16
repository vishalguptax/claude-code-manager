/**
 * Reactive state for the Plugins tab.
 *
 * Source state is the host snapshot plus the two controls (search, view).
 * Everything a view reads — the filtered list, the counts on the segments —
 * is `computed`, so no component filters inline and the "issues" count on
 * the segment can never disagree with the list it opens.
 */
import { computed, signal } from "@preact/signals";
import type {
  MarketplaceEntry,
  PluginEntry,
  PluginPolicyEntry,
  PluginsData,
} from "../../types";

/** Which list the tab is showing. */
export type PluginsView = "all" | "issues" | "sources";

/** All plugins, as last received from the host. */
export const plugins = signal<PluginEntry[]>([]);

/** All marketplaces, as last received from the host. */
export const marketplaces = signal<MarketplaceEntry[]>([]);

/** Resolved plugin-related settings keys. */
export const policy = signal<PluginPolicyEntry[]>([]);

/** Non-fatal parse problems that arrived with the snapshot. */
export const parseErrors = signal<string[]>([]);

/** True until the first snapshot arrives. */
export const loading = signal<boolean>(true);

/** Lowercased free-text query. */
export const searchQuery = signal<string>("");

/** Active view. */
export const view = signal<PluginsView>("all");

/**
 * The plugin whose detail view is open, or null while the list is showing.
 * Every other tab drills into a row this way; the palette also sets it, so a
 * Cmd+K hit lands on the plugin rather than merely on the tab.
 */
export const selectedPlugin = signal<PluginEntry | null>(null);

/**
 * A plugin the user should look at: Claude Code is ignoring it, it has no
 * install behind it, it is blocked, or it is live from a marketplace the
 * policy does not allow. This is the set the tab exists for.
 */
export function isIssue(plugin: PluginEntry): boolean {
  return (
    plugin.status === "not-enabled" ||
    plugin.status === "orphaned" ||
    plugin.status === "blocked" ||
    plugin.untrustedSource
  );
}

/** Plugins needing attention. */
export const issues = computed<PluginEntry[]>(() => plugins.value.filter(isIssue));

/** Plugins matching the current view and query. */
export const visiblePlugins = computed<PluginEntry[]>(() => {
  const list = view.value === "issues" ? issues.value : plugins.value;
  const query = searchQuery.value;
  if (query === "") return list;
  return list.filter(
    (p) =>
      p.id.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.marketplace.toLowerCase().includes(query),
  );
});

/** Marketplaces matching the current query. */
export const visibleMarketplaces = computed<MarketplaceEntry[]>(() => {
  const query = searchQuery.value;
  if (query === "") return marketplaces.value;
  return marketplaces.value.filter(
    (m) => m.name.toLowerCase().includes(query) || m.sourceLabel.toLowerCase().includes(query),
  );
});

/** Counts for the view segments. */
export const viewCounts = computed(() => ({
  all: plugins.value.length,
  issues: issues.value.length,
  sources: marketplaces.value.length,
}));

/** Apply a host snapshot. */
export function applyPluginsData(data: PluginsData): void {
  plugins.value = data.plugins;
  marketplaces.value = data.marketplaces;
  policy.value = data.policy;
  parseErrors.value = data.errors;
  loading.value = false;
  // Re-resolve the open detail against the fresh list, so a plugin that was
  // uninstalled or toggled on the host does not leave a stale panel open.
  const sel = selectedPlugin.value;
  if (sel) selectedPlugin.value = plugins.value.find((p) => p.id === sel.id) ?? null;
}

/** Reset every signal. Test-only helper. */
export function _resetPluginsState(): void {
  plugins.value = [];
  marketplaces.value = [];
  policy.value = [];
  parseErrors.value = [];
  loading.value = true;
  searchQuery.value = "";
  view.value = "all";
  selectedPlugin.value = null;
}
