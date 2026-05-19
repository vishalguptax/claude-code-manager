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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setClientHeight(el.clientHeight);
    const onScroll = (): void => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [containerRef]);

  const viewport = clientHeight || itemHeight * 10;
  const rawStart = Math.floor(scrollTop / itemHeight) - overscan;
  const rawEnd = Math.ceil((scrollTop + viewport) / itemHeight) + overscan;
  const startIndex = Math.max(0, rawStart);
  const endIndex = Math.min(itemCount, Math.max(startIndex, rawEnd));
  const totalHeight = itemCount * itemHeight;
  const offsetY = startIndex * itemHeight;

  return { startIndex, endIndex, totalHeight, offsetY };
}
