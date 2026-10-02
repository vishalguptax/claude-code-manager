/**
 * Pure helpers for the Browse view: what a catalog search matches, how the
 * list groups, and what each install scope means.
 */
import type { AvailablePlugin, PluginInstallScope } from "../../types";

/** Entries whose id, description, category or author contains the lowercased query. */
export function filterAvailable(list: readonly AvailablePlugin[], query: string): AvailablePlugin[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...list];
  return list.filter(
    (p) =>
      p.id.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q),
  );
}

/** A Browse list entry: a marketplace heading, or a plugin under it. */
export type CatalogRow =
  | { kind: "label"; marketplace: string }
  | { kind: "item"; plugin: AvailablePlugin };

/**
 * Interleave a heading before each marketplace's run of plugins. Expects the
 * host's order (grouped by marketplace), which filtering preserves.
 */
export function buildCatalogRows(list: readonly AvailablePlugin[]): CatalogRow[] {
  const rows: CatalogRow[] = [];
  let current: string | null = null;
  for (const plugin of list) {
    if (plugin.marketplace !== current) {
      current = plugin.marketplace;
      rows.push({ kind: "label", marketplace: current });
    }
    rows.push({ kind: "item", plugin });
  }
  return rows;
}

/** The catalog line under a plugin's name: its category and author, when known. */
export function catalogByline(plugin: AvailablePlugin): string {
  return [plugin.category, plugin.author].filter((part) => part !== "").join(" · ");
}

/**
 * The three install scopes in `claude plugin install --scope`'s own names,
 * with where each records the install — the deciding question is who else
 * gets the plugin.
 */
export const INSTALL_SCOPES: ReadonlyArray<{
  value: PluginInstallScope;
  label: string;
  explain: string;
}> = [
  { value: "user", label: "User", explain: "You, in every project." },
  {
    value: "project",
    label: "Project",
    explain: "Everyone on this project. Recorded in .claude/settings.json, which is committed.",
  },
  {
    value: "local",
    label: "Local",
    explain: "You, in this project only. Recorded in .claude/settings.local.json.",
  },
];
