/**
 * Which collapsible sections are closed, across every tab.
 *
 * Account grew this first; Config then hand-rolled four static
 * `<header class="section-header">` elements and shipped without collapse at
 * all — which left the LONGER of the two panels as the one you could not fold.
 * Twenty settings, a permission list, a snapshot history and a backup block,
 * all permanently expanded, in a 340px column.
 *
 * Ids are namespaced by tab (`account:usage`, `config:permissions`) because
 * this is one store: two tabs both wanting a section called "permissions"
 * would otherwise fold each other's.
 *
 * Deliberately not persisted. A collapsed section is a reading position, not a
 * preference — coming back to a panel you folded last week and finding half of
 * it hidden is worse than re-folding it.
 *
 * A section can start collapsed (Config folds its rarely-used tail so the
 * settings people came for are what the panel opens on). The set therefore
 * holds the ids the user has flipped from their default; for a section open
 * by default, that is simply "collapsed".
 */
import { signal } from "@preact/signals";

export const collapsedSections = signal<ReadonlySet<string>>(new Set());

/** Whether the given section id is currently collapsed. */
export function isSectionCollapsed(id: string, collapsedByDefault = false): boolean {
  return collapsedSections.value.has(id) !== collapsedByDefault;
}

/** Flip a section from its current state, producing a new Set so signal subscribers re-render. */
export function toggleSection(id: string): void {
  const next = new Set(collapsedSections.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedSections.value = next;
}

/** Test-only: forget every collapsed section. */
export function _resetSections(): void {
  collapsedSections.value = new Set();
}
