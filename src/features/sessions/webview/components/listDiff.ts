/**
 * Keyed reconciliation for an ordered list of DOM children.
 *
 * Reuses existing nodes that match by key (`data-key` attribute), creating
 * new ones via `factory(key)` and removing orphans. After matching, the
 * caller's `updater(node, key)` patches in-place state — class flips,
 * text content, attribute swaps — so heavy work like search-keystroke
 * re-renders mutate only the bytes that actually changed.
 *
 * Order is preserved by walking `desiredKeys` and inserting each node
 * before the next existing sibling we plan to keep.
 */
export function applyDiff(
  container: HTMLElement,
  desiredKeys: string[],
  factory: (key: string) => HTMLElement,
  updater: (node: HTMLElement, key: string) => void,
): void {
  const existing = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement;
    const key = el.dataset.key;
    if (key === undefined) {
      // Foreign children (e.g. an empty-state node from a prior render
      // that wrote `innerHTML` directly) are not part of this diff and
      // would otherwise linger forever — drop them up front.
      el.remove();
      continue;
    }
    existing.set(key, el);
  }

  const desiredSet = new Set(desiredKeys);
  for (const [key, node] of existing) {
    if (!desiredSet.has(key)) {
      node.remove();
      existing.delete(key);
    }
  }

  let cursor: Node | null = container.firstChild;
  for (const key of desiredKeys) {
    let node = existing.get(key);
    if (!node) {
      node = factory(key);
      node.dataset.key = key;
    }
    updater(node, key);
    if (cursor === node) {
      cursor = node.nextSibling;
    } else {
      container.insertBefore(node, cursor);
    }
  }
}
