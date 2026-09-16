/**
 * Pure editing operations for the Config tab's tab-visibility/order picker.
 *
 * `TabsView` owns one array of ids (the picker's current full order,
 * including hidden tabs — hiding is a separate boolean per row, not
 * removal from this list) and one hidden-id set. Every user action —
 * drag a row, click an up/down button, toggle a checkbox — reduces to one
 * of the two functions here, kept framework-free so the edit itself is
 * unit-testable without mounting the component.
 */

/**
 * Move the id at `from` to sit at `to`, shifting everything between them.
 * Out-of-range indices are clamped rather than ignored, so a caller doing
 * arithmetic on `index - 1` / `index + 1` at either end of the list never
 * has to special-case the boundary — moving the first row up is simply a
 * no-op, not an error.
 */
export function moveTab(order: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length) return [...order];
  const clampedTo = Math.max(0, Math.min(to, order.length - 1));
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

/**
 * Add or remove `id` from the hidden set, returned as a new array (not a
 * Set) because that is the shape both the outbound message and
 * `claudeManager.hiddenTabs` itself already use — nothing downstream of
 * this function needs Set semantics.
 */
export function toggleHiddenTab(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}
