/**
 * The plugins a user could install: every entry in the catalogs of the
 * marketplaces Claude Code has already added.
 *
 * Read from disk, never fetched. Claude Code clones each marketplace to its
 * `known_marketplaces.json` `installLocation` and keeps the clone current
 * itself; the catalog is that clone's `.claude-plugin/marketplace.json`, the
 * documented marketplace format. So the list is exactly what `/plugin` would
 * offer, as fresh as Claude Code's last marketplace refresh, at no network
 * cost. Skills ship through the same channel, as plugins.
 *
 * Plugins Claude Code would refuse are never offered: a blocklisted id, or
 * anything from a marketplace the managed policy blocks or leaves off its
 * allowlist.
 *
 * Pure. The reads happen in parser.ts's `readPluginSources`, beside every
 * other filesystem touch this feature makes.
 */
import * as path from "path";
import { isInstallablePluginId } from "./ids";
import type { AvailablePlugin, MarketplaceTrust } from "./types";

/** One plugin as a marketplace catalog lists it, reduced to what the tab shows. */
export interface RawCatalogPlugin {
  name: string;
  description: string;
  category: string;
  author: string;
  homepage: string;
}

/** Where Claude Code keeps a cloned marketplace's catalog. */
export function catalogPath(installLocation: string): string {
  return path.join(installLocation, ".claude-plugin", "marketplace.json");
}

/** A trimmed string, else "". */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validate a parsed `marketplace.json` into catalog entries. Anything that is
 * not an object with a name is skipped rather than failing the catalog — one
 * malformed entry should not hide the rest of a marketplace.
 *
 * Only an https homepage is kept: the link opens in the user's browser, and
 * a catalog is third-party content.
 */
export function parseCatalog(data: Record<string, unknown>): RawCatalogPlugin[] {
  if (!Array.isArray(data.plugins)) return [];
  const out: RawCatalogPlugin[] = [];
  for (const raw of data.plugins) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const name = text(entry.name);
    if (name === "") continue;
    const author = entry.author;
    const homepage = text(entry.homepage);
    out.push({
      name,
      description: text(entry.description),
      category: text(entry.category),
      author:
        author !== null && typeof author === "object"
          ? text((author as Record<string, unknown>).name)
          : "",
      homepage: /^https:\/\//i.test(homepage) ? homepage : "",
    });
  }
  return out;
}

/** Marketplaces whose plugins Claude Code will install. */
function installable(trust: MarketplaceTrust | undefined): boolean {
  return trust === "official" || trust === "allowlisted" || trust === "known";
}

/**
 * Join the catalogs against what is installed and what policy allows.
 *
 * Sorted by marketplace, Anthropic's own first, then by name, so the list
 * groups the way `/plugin` does.
 */
export function buildAvailablePlugins(
  catalogs: Readonly<Record<string, RawCatalogPlugin[]>>,
  trustByName: ReadonlyMap<string, MarketplaceTrust>,
  installedIds: ReadonlySet<string>,
  blockedIds: ReadonlySet<string>,
  officialMarketplace: string,
): AvailablePlugin[] {
  const out: AvailablePlugin[] = [];
  const seen = new Set<string>();
  for (const [marketplace, entries] of Object.entries(catalogs)) {
    if (!installable(trustByName.get(marketplace))) continue;
    for (const entry of entries) {
      const id = `${entry.name}@${marketplace}`;
      if (!isInstallablePluginId(id) || blockedIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, marketplace, ...entry, installed: installedIds.has(id) });
    }
  }
  const rank = (m: string): number => (m === officialMarketplace ? 0 : 1);
  return out.sort(
    (a, b) =>
      rank(a.marketplace) - rank(b.marketplace) ||
      a.marketplace.localeCompare(b.marketplace) ||
      a.name.localeCompare(b.name),
  );
}
