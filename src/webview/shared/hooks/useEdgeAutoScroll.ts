/**
 * Scroll a horizontally-overflowing strip while the pointer rests near its edge.
 *
 * A strip that scrolls but hides its scrollbar (the tab bar) has no visible
 * affordance for the part hanging off the end: the only ways to reach it are a
 * trackpad gesture or the keyboard, and neither announces itself. Nudging the
 * strip while the pointer sits over the last visible item makes the overflow
 * discoverable with the input the user already has on it.
 *
 * The scroll is proportional to how deep into the edge zone the pointer is, so
 * it eases in rather than jumping, and it stops the moment the pointer leaves
 * the zone or the strip reaches its end.
 *
 * Generic on purpose — any `overflow-x` container can use it.
 */

import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/** How far from an edge (px) the pointer starts pulling the strip. */
const EDGE_ZONE = 36;
/** Fastest nudge, in px per animation frame, at the very edge. */
const MAX_SPEED = 6;

export interface EdgeAutoScrollOptions {
  /** Turn the behaviour off without changing the call site's hook order. */
  enabled?: boolean;
}

export function useEdgeAutoScroll(
  ref: RefObject<HTMLElement>,
  { enabled = true }: EdgeAutoScrollOptions = {},
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    // Auto-scrolling is motion the user did not ask for. Anyone who has asked
    // the OS for less of it keeps the strip still; the keyboard, the trackpad
    // and TabBar's own scroll-active-into-view all still reach the overflow.
    const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) return;

    let velocity = 0;
    let frame = 0;

    const step = (): void => {
      frame = 0;
      if (velocity === 0) return;
      const before = el.scrollLeft;
      el.scrollLeft = before + velocity;
      // Stop at the ends rather than burning a frame every tick forever.
      if (el.scrollLeft !== before) frame = requestAnimationFrame(step);
      else velocity = 0;
    };

    const run = (): void => {
      if (velocity !== 0 && frame === 0) frame = requestAnimationFrame(step);
    };

    const onMove = (e: PointerEvent): void => {
      // Nothing to reach: leave the strip alone entirely.
      if (el.scrollWidth <= el.clientWidth + 1) {
        velocity = 0;
        return;
      }
      const box = el.getBoundingClientRect();
      const fromLeft = e.clientX - box.left;
      const fromRight = box.right - e.clientX;
      if (fromRight <= EDGE_ZONE) {
        velocity = MAX_SPEED * (1 - Math.max(fromRight, 0) / EDGE_ZONE);
      } else if (fromLeft <= EDGE_ZONE) {
        velocity = -MAX_SPEED * (1 - Math.max(fromLeft, 0) / EDGE_ZONE);
      } else {
        velocity = 0;
      }
      run();
    };

    const stop = (): void => {
      velocity = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", stop);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", stop);
      stop();
    };
  }, [ref, enabled]);
}
