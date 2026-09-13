/**
 * Whether a tooltip would actually tell the user something.
 *
 * A tooltip earns its place in three cases and no others:
 *
 *   1. The control has no visible text — an icon-only button, where the
 *      tooltip IS the label.
 *   2. Its text is truncated — a long session title, branch or path clipped
 *      to an ellipsis, where the tooltip is the only way to read the rest.
 *   3. The title says something the visible text does not — "Start a new
 *      Claude Code session in a fresh terminal" on a button reading
 *      "New Session".
 *
 * Anything else repeats what the user is already looking at. That was the
 * first version's mistake: it fired on every `title` in the panel, so hovering
 * a fully-visible session title popped a box containing that same title.
 */

/** Normalise for comparison: collapse whitespace, ignore case and an ellipsis. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[…]/g, "").trim().toLowerCase();
}

/**
 * Is this element (or the element inside it that holds the label) clipped?
 *
 * Chips put their label in a child span — the chip itself is a flex container
 * sized to fit, so only the child overflows — which is why the child is
 * checked as well as the element itself.
 */
export function isTextTruncated(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) return true;
  for (const child of Array.from(el.children)) {
    const c = child as HTMLElement;
    if (c.scrollWidth > c.clientWidth + 1) return true;
  }
  return false;
}

export function shouldShowTooltip(el: HTMLElement, title: string): boolean {
  if (!title.trim()) return false;

  const text = (el.textContent ?? "").trim();
  // Icon-only control: the tooltip is the only label it has.
  if (!text) return true;

  // Clipped text: the tooltip is the only way to read the whole value.
  if (isTextTruncated(el)) return true;

  // Fully visible and the title just repeats it — nothing to add.
  const a = normalise(title);
  const b = normalise(text);
  if (a === b) return false;
  // The visible text is the title with something appended (a chip's count, a
  // timestamp), or the title is the start of it. Still a repeat.
  if (b.startsWith(a) || a.startsWith(b)) return false;

  return true;
}
