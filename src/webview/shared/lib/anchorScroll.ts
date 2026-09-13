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
 * The fix is to put the scroll OFFSET back after the change. Collapsing a
 * section never moves its own header — everything below it moves — so the
 * header shifts only because the offset was clamped, and restoring the offset
 * restores the header. Measuring the anchor's before/after positions instead
 * does not work: the clamp is applied after the correction callback runs, so
 * the difference reads zero and nothing fires.
 *
 * Where the collapse leaves the content shorter than the panel there is no
 * offset left to hold: the maximum is 0. For that case the scroller is given
 * temporary room below its content, just enough to keep the anchor still. The
 * blank space is not new — a panel whose content no longer fills it already
 * had that gap; the room moves it below the content instead of letting
 * everything jump up. It is released as soon as the user scrolls back to where
 * the real content ends, or when the content grows enough not to need it.
 */

/** How many frames to wait for a collapse to land before correcting anyway. */
const SETTLE_FRAMES = 10;

/** Numeric px of extra room currently held open on a scroller. */
const EXTRA = "anchorExtra";
/** The inline padding-bottom that was there before, restored on release. */
const INLINE = "anchorPadInline";
/** The element's own padding-bottom in px, measured before any was added. */
const BASE = "anchorPadBase";

function extraOf(el: HTMLElement): number {
  return Number(el.dataset[EXTRA] ?? 0);
}

/**
 * Hold `px` of empty space below the content. Passing 0 restores the element's
 * own padding exactly as it was.
 */
function setExtra(el: HTMLElement, px: number): void {
  if (px <= 0) {
    if (el.dataset[EXTRA] === undefined) return;
    el.style.paddingBottom = el.dataset[INLINE] ?? "";
    delete el.dataset[EXTRA];
    delete el.dataset[INLINE];
    delete el.dataset[BASE];
    return;
  }
  if (el.dataset[EXTRA] === undefined) {
    el.dataset[INLINE] = el.style.paddingBottom;
    const computed = el.ownerDocument.defaultView?.getComputedStyle(el).paddingBottom;
    el.dataset[BASE] = String(Number.parseFloat(computed ?? "0") || 0);
  }
  el.dataset[EXTRA] = String(px);
  el.style.paddingBottom = `${Number(el.dataset[BASE] ?? 0) + px}px`;
}

/**
 * Give the room back the moment it stops doing anything: once the user has
 * scrolled to (or above) the end of the real content, the extra space below is
 * dead weight they can scroll into.
 */
function releaseWhenUnused(el: HTMLElement): void {
  if (el.dataset.anchorWatching === "1") return;
  el.dataset.anchorWatching = "1";
  const onScroll = (): void => {
    const extra = extraOf(el);
    if (extra === 0) {
      el.removeEventListener("scroll", onScroll);
      delete el.dataset.anchorWatching;
      return;
    }
    const naturalMax = el.scrollHeight - extra - el.clientHeight;
    if (el.scrollTop <= Math.max(naturalMax, 0)) {
      setExtra(el, 0);
      el.removeEventListener("scroll", onScroll);
      delete el.dataset.anchorWatching;
    }
  };
  el.addEventListener("scroll", onScroll, { passive: true });
}

/**
 * Room the scroller needs held open below its content for `target` to be a
 * reachable scroll offset, capped at one screenful.
 */
function roomFor(el: HTMLElement, target: number): number {
  // Room is measured from the CONTENT, not from the current maximum offset.
  // Taking `max(content - clientHeight, 0)` as the baseline under-provisions
  // whenever the content is shorter than the panel: the shortfall between them
  // has to be covered before the offset can move at all, so a 260px offset
  // over 380px of content in a 570px panel needs 450px of room, not 260.
  const content = el.scrollHeight - extraOf(el);
  const needed = target + el.clientHeight - content;
  if (needed <= 0) return 0;
  // Past a screenful the anchor is being held above content that no longer
  // exists, and the panel reads as broken rather than as scrolled.
  return Math.min(Math.ceil(needed), el.clientHeight);
}

/** Put the scroller at `target`, opening or releasing room so it can get there. */
function scrollTo(el: HTMLElement, target: number): void {
  const room = roomFor(el, target);
  setExtra(el, room);
  el.scrollTop = target;
  if (room > 0) releaseWhenUnused(el);
}

/**
 * Run `mutate`, then put `anchor` back where it was on screen.
 *
 * This restores the OFFSET first and measures the anchor afterwards, rather
 * than measuring a before/after delta and applying it. Collapsing a section
 * does not move its own header at all — everything below it moves — so the
 * header only shifts because the browser clamps the scroll offset to the
 * shortened content. That clamp is applied after this callback runs, so a
 * delta measured here reads zero and a delta-based correction never fires,
 * which is exactly the bug this had on its first attempt: the offset was
 * already back at 0 by the time anyone looked.
 *
 * Restoring the offset unconditionally handles the clamp. The delta pass after
 * it catches the genuine case where the anchor itself moved — a section above
 * this one changing height in the same update.
 */
export function keepAnchored(anchor: HTMLElement | null, mutate: () => void): void {
  const scroller = anchor ? findScroller(anchor) : null;
  if (!anchor || !scroller) {
    mutate();
    return;
  }

  const top = anchor.getBoundingClientRect().top;
  const height = scroller.scrollHeight;
  mutate();

  const correct = (): void => {
    // Converge on "the anchor is where it was". Each pass moves the offset by
    // the remaining drift; opening room changes the layout, so the result is
    // re-measured rather than assumed. Two passes are enough in practice and
    // the third is a stop, not a strategy.
    for (let pass = 0; pass < 3; pass++) {
      const drift = anchor.getBoundingClientRect().top - top;
      if (Math.abs(drift) < 0.5) break;
      scrollTo(scroller, scroller.scrollTop + drift);
    }

    // Trim to exactly what the final offset needs. This both gives back room a
    // pass over-allocated and releases it entirely once the content has grown
    // enough to hold the offset by itself — otherwise expanding the section
    // again would leave the empty space below it forever.
    const room = roomFor(scroller, scroller.scrollTop);
    setExtra(scroller, room);
    if (room > 0) releaseWhenUnused(scroller);
  };

  if (typeof requestAnimationFrame !== "function") {
    correct();
    return;
  }

  // Wait for the collapse to actually land. The caller sets a signal, and the
  // component re-render it triggers does not necessarily happen before the
  // next frame — correcting too early measures the OLD height, finds nothing
  // to fix, and then the browser clamps the offset afterwards. So watch for
  // the content height to change, and give up after a few frames so a toggle
  // that does not resize anything still gets its drift pass.
  let frames = 0;
  const waitForLayout = (): void => {
    if (scroller.scrollHeight !== height || frames >= SETTLE_FRAMES) {
      correct();
      return;
    }
    frames++;
    requestAnimationFrame(waitForLayout);
  };
  requestAnimationFrame(waitForLayout);
}

/**
 * Nearest ancestor that actually scrolls vertically. `overflow-y` alone is not
 * enough: the feature panels all set `overflow-y: auto`, so the first match
 * would often be an element with nothing to scroll, and adjusting its offset
 * would do nothing while the real scroller moved.
 *
 * An element already holding room open counts as scrollable even if its own
 * content would fit, since that room is what the anchor is standing on.
 */
export function findScroller(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    const overflow = `${style?.overflowY ?? ""}`;
    if (overflow === "auto" || overflow === "scroll") {
      if (node.scrollHeight > node.clientHeight || extraOf(node) > 0) return node;
    }
    node = node.parentElement;
  }
  return null;
}
