/**
 * The command palette's item registry.
 *
 * Eight tabs, each with its own search box that only searches itself. Finding a
 * session while you are on Config meant switching tabs, waiting for the lazy
 * panel to mount, and typing again. This is the one search over all of it.
 *
 * Features PUSH into this registry; the palette never reaches into a feature.
 * That is not ceremony — it is the boundary rule that keeps features from
 * importing each other's signals, and it means a new tab becomes searchable by
 * registering a source rather than by editing the palette.
 *
 * A registered source is a function, not a snapshot: it is called on each
 * query, so it always sees the feature's current signals without this module
 * subscribing to them or caching anything that can go stale.
 *
 * One honest limitation. Tabs mount lazily, so a feature the user has never
 * opened has not registered and its items are not searchable yet. The palette
 * always carries tab navigation, which is what you would reach for anyway to
 * open that tab — and it is exactly the case where you do not yet know what is
 * in there.
 */

/** One thing the palette can find and do. */
export interface PaletteItem {
  /** Unique within its source; used as the render key. */
  id: string;
  /** The line the user reads and matches against. */
  title: string;
  /** Dimmer second line: a project, a path, a relative time. */
  subtitle?: string;
  /** Heading this item is listed under ("Sessions", "Skills", "Go to"). */
  group: string;
  /** Lucide icon name shown in the leading gutter. */
  icon?: string;
  /** Right-aligned hint — a timestamp, a scope, a shortcut. */
  hint?: string;
  /** Performed when the item is chosen. The palette closes first. */
  run: () => void;
}

export type PaletteSource = () => PaletteItem[];

const sources = new Map<string, PaletteSource>();

/**
 * Register a feature's items. Returns an unsubscribe — call it on unmount, or
 * a remount registers the source twice and every item appears in duplicate.
 */
export function registerPaletteSource(id: string, source: PaletteSource): () => void {
  sources.set(id, source);
  return () => {
    // Only remove our own registration: a remount may already have replaced it,
    // and the stale unsubscribe must not delete the live one.
    if (sources.get(id) === source) sources.delete(id);
  };
}

/** Test-only: drop every registration. */
export function _resetPaletteSources(): void {
  sources.clear();
}

/**
 * Score a candidate against a lowercased query. Higher is better; 0 means no
 * match, so the caller can filter on it.
 *
 * The ranking is deliberately simple and explainable, because a palette that
 * reorders in ways the user cannot predict is worse than one that does not
 * rank at all:
 *
 *   3  the title starts with the query   — you typed the beginning of it
 *   2  the title contains the query      — you typed part of it
 *   1  the subtitle contains the query   — the context matched, not the name
 *
 * No fuzzy subsequence matching. With a few hundred items it turns a specific
 * query into a page of near-misses, and every one of these lists is already
 * searchable by exact substring in its own tab.
 */
export function scoreItem(item: PaletteItem, query: string): number {
  const title = item.title.toLowerCase();
  if (title.startsWith(query)) return 3;
  if (title.includes(query)) return 2;
  if (item.subtitle?.toLowerCase().includes(query)) return 1;
  return 0;
}

/** Maximum items returned, so a two-character query cannot render thousands. */
export const PALETTE_LIMIT = 50;

/**
 * Collect and rank items for a query.
 *
 * An empty query returns everything (capped), so opening the palette shows
 * what is available rather than a blank box. Results keep each source's own
 * order within a score band, and groups stay contiguous in the output so the
 * rendered list can insert headings without re-sorting.
 */
export function collectPaletteItems(query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const scored: Array<{ item: PaletteItem; score: number; seq: number }> = [];
  let seq = 0;

  for (const source of sources.values()) {
    let items: PaletteItem[];
    try {
      items = source();
    } catch {
      // A feature whose signals are mid-update must not take the palette down
      // with it; its items are simply absent from this query.
      continue;
    }
    for (const item of items) {
      const score = q ? scoreItem(item, q) : 1;
      if (score > 0) scored.push({ item, score, seq: seq++ });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.seq - b.seq);
  const top = scored.slice(0, PALETTE_LIMIT).map((s) => s.item);

  // Keep groups contiguous without disturbing the ranking: a group takes the
  // position of its best-scoring member.
  const order: string[] = [];
  const byGroup = new Map<string, PaletteItem[]>();
  for (const item of top) {
    if (!byGroup.has(item.group)) {
      byGroup.set(item.group, []);
      order.push(item.group);
    }
    byGroup.get(item.group)?.push(item);
  }
  return order.flatMap((g) => byGroup.get(g) ?? []);
}
