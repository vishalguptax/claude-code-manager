/**
 * Keep the element you just clicked where it is on screen while the layout
 * around it changes.
 *
 * Collapsing a tall section removes hundreds of pixels from a scrolling panel.
 * The browser then clamps `scrollTop` to the new maximum, so everything below
 * the fold slides up and the header the user just clicked flies out from under
 * the pointer — in the Account tab, collapsing Usage moved its own header
 * 260px down the panel, because the content went from 1345px to 570px and the
 * scroll offset had to drop from 260 to 0.
 *
 * The fix is what browsers call scroll anchoring: measure the anchor before the
 * change, measure it after, and move the scroll offset by the difference. Where
 * the panel can still scroll, the anchor does not move at all. Where the
 * content no longer overflows, nothing can hold it in place — the offset is
 * already 0 — and it settles at its natural position instead of somewhere
 * arbitrary.
 */

/**
 * Nearest ancestor that actually scrolls vertically. `overflow-y` alone is not
 * enough: the feature panels all set `overflow-y: auto`, so the first match
 * would often be an element with nothing to scroll, and adjusting its offset
 * would do nothing while the real scroller moved.
 */
export function findScroller(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    const overflow = `${style?.overflowY ?? ""}`;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Run `mutate`, then restore `anchor`'s on-screen position.
 *
 * The correction runs on the next frame because the caller's state change
 * renders asynchronously — signals batch into a microtask, so the DOM is not
 * final when `mutate` returns.
 */
export function keepAnchored(anchor: HTMLElement | null, mutate: () => void): void {
  const scroller = anchor ? findScroller(anchor) : null;
  if (!anchor || !scroller) {
    mutate();
    return;
  }

  const before = anchor.getBoundingClientRect().top;
  mutate();

  const correct = (): void => {
    const after = anchor.getBoundingClientRect().top;
    const delta = after - before;
    // Sub-pixel noise is not worth a scroll write, which would itself cancel
    // the browser's own anchoring.
    if (Math.abs(delta) < 0.5) return;
    scroller.scrollTop += delta;
  };

  if (typeof requestAnimationFrame === "function") requestAnimationFrame(correct);
  else correct();
}
