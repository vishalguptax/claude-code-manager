/**
 * Compute the visible window for a fixed-height vertical list inside a
 * scrollable container. Listens to the container's `scroll` events and
 * returns a viewport range plus offsets sized for absolute positioning.
 */

import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";

export interface VirtualizerOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  containerRef: RefObject<HTMLElement>;
}

export interface VirtualizerResult {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
}

export function useVirtualizer(opts: VirtualizerOptions): VirtualizerResult {
  const { itemCount, itemHeight, overscan = 4, containerRef } = opts;
  const [scrollTop, setScrollTop] = useState(0);
  const [clientHeight, setClientHeight] = useState(0);

  // Measure after layout and keep the viewport height current. The container
  // is frequently 0px tall on first paint (the webview tab may still be laid
  // out, or hidden via display:none), so a single measurement in a mount
  // effect would lock the viewport to the itemHeight*10 fallback forever and
  // never recover. A ResizeObserver re-measures whenever the sidebar resizes
  // or the tab becomes visible.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = (): void => setClientHeight(el.clientHeight);
    measure();
    const onScroll = (): void => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measure();
            // scrollTop can change implicitly when the viewport grows.
            setScrollTop(el.scrollTop);
          })
        : undefined;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [containerRef]);

  // Until the real viewport height is known, render a sane initial window so
  // items appear immediately without reserving the spacer's full height as a
  // visible gap. Once clientHeight is measured the window snaps to the
  // scrollable region.
  const viewport = clientHeight || itemHeight * 10;
  const rawStart = Math.floor(scrollTop / itemHeight) - overscan;
  const rawEnd = Math.ceil((scrollTop + viewport) / itemHeight) + overscan;
  const startIndex = Math.max(0, rawStart);
  const endIndex = Math.min(itemCount, Math.max(startIndex, rawEnd));
  const totalHeight = itemCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, totalHeight, offsetY };
}
