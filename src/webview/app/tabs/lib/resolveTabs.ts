/**
 * Applies the user's `claudeManager.hiddenTabs` / `claudeManager.tabOrder`
 * preferences to the static tab registry.
 *
 * Pure and framework-free so the ordering/filtering rules are testable
 * without mounting a signal or a component — the reactive wrapper around
 * this lives in `visibleTabs.ts`.
 */
import type { Feature } from "../tabRegistry";

/**
 * Reorder `all` so any id present in `order` comes first, in the sequence
 * given, followed by everything else in its original relative order.
 *
 * An id in `order` that does not name a real tab is dropped rather than
 * rejected outright — a tab renamed or removed in a future release must not
 * turn a user's whole ordering into a no-op, and the manifest's enum already
 * stops a hand-edited settings.json from introducing most typos. A repeated
 * id counts only at its first occurrence, so a mistake like listing the same
 * tab twice does not duplicate it in the strip.
 */
function applyOrder(all: readonly Feature[], order: readonly string[]): Feature[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const placed = new Set<string>();
  const head: Feature[] = [];
  for (const id of order) {
    if (placed.has(id)) continue;
    const tab = byId.get(id);
    if (!tab) continue;
    head.push(tab);
    placed.add(id);
  }
  const tail = all.filter((t) => !placed.has(t.id));
  return [...head, ...tail];
}

/**
 * Resolve the tabs that should actually render, in the order they should
 * render in.
 *
 * `hidden` is applied AFTER ordering, and — deliberately — only if it would
 * not hide every tab. A settings.json edited by hand (or a future version
 * that renames every current tab id) could otherwise leave the whole panel
 * blank with no way back in short of clearing a setting the user may not
 * remember they set. Showing everything instead is the safe failure: too
 * many tabs is a scrolling strip, zero tabs is a broken extension.
 */
export function resolveVisibleTabs(
  all: readonly Feature[],
  hidden: readonly string[],
  order: readonly string[],
): Feature[] {
  const ordered = order.length > 0 ? applyOrder(all, order) : [...all];
  if (hidden.length === 0) return ordered;

  const hiddenIds = new Set(hidden);
  const filtered = ordered.filter((t) => !hiddenIds.has(t.id));
  return filtered.length > 0 ? filtered : ordered;
}
