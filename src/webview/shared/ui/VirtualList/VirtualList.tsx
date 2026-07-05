/**
 * Windowed vertical list. Renders only the rows inside the viewport (plus
 * overscan) so a list of thousands scrolls in constant time.
 *
 * Variable-height by measurement: rows are NOT assumed to share one height.
 * `itemHeight` is only the ESTIMATE used before a row has been measured (and
 * for off-screen rows). Each rendered row is measured after layout; its real
 * height feeds a per-index cache, the cumulative offsets are recomputed, and
 * the spacer + each row's absolute position track the true content height.
 *
 * Why this matters: the session/skill/command/etc. lists interleave short
 * group-header rows with taller item rows in a single list. A fixed
 * `index * itemHeight` model drifts — rows land at the wrong offset (janky
 * scroll) and the spacer disagrees with real content (the scrollbar thumb
 * resizes as you scroll). Measuring each row removes both.
 */
import type { ComponentChild } from "preact";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";

export interface VirtualListProps<T> {
  items: T[];
  /** Estimated row height (px). Used for unmeasured/off-screen rows only. */
  itemHeight: number;
  renderItem: (item: T, index: number) => ComponentChild;
  overscan?: number;
  class?: string;
}

/** Cumulative top offset for each index plus the grand total. */
function buildOffsets(count: number, heightAt: (i: number) => number): {
  offsets: number[];
  total: number;
} {
  const offsets = new Array<number>(count);
  let acc = 0;
  for (let i = 0; i < count; i++) {
    offsets[i] = acc;
    acc += heightAt(i);
  }
  return { offsets, total: acc };
}

/** Largest index whose offset is <= `top` (binary search over offsets). */
function findStart(offsets: number[], top: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= top) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, itemHeight, renderItem, overscan = 4, class: cls } = props;
  const count = items.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  // Measured heights per index; undefined until a row has been laid out.
  const measured = useRef<number[]>([]);
  // Bumped whenever a measurement changes so the offsets rebuild.
  const [measureVersion, forceRecompute] = useState(0);
  const heightAt = useCallback(
    (i: number): number => measured.current[i] ?? itemHeight,
    [itemHeight],
  );

  const { offsets, total } = useMemo(
    () => buildOffsets(count, heightAt),
    // Offsets depend only on the row count, the estimate, and the measured
    // heights (whose changes are signalled by measureVersion) — NOT on
    // scroll position, so scrolling never rebuilds them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, heightAt, measureVersion],
  );

  const view = viewport || itemHeight * 10;
  const start = count === 0 ? 0 : Math.max(0, findStart(offsets, scrollTop) - overscan);
  let end = start;
  while (end < count && offsets[end] < scrollTop + view) end++;
  end = Math.min(count, end + overscan);

  // rAF-coalesced scroll + a ResizeObserver for viewport changes (sidebar
  // resize, tab becoming visible — the container is often 0px on first paint).
  const rafRef = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const syncViewport = (): void => setViewport(el.clientHeight);
    syncViewport();
    const onScroll = (): void => {
      if (rafRef.current !== undefined) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined;
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncViewport();
            setScrollTop(el.scrollTop);
          })
        : undefined;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Measure the rendered rows after layout; correct the cache when a real
  // height differs from the estimate. Guard on h > 0 so hidden tabs
  // (clientHeight 0) and non-layout test environments keep the estimate
  // instead of collapsing every row to zero.
  //
  // Deps matter for scroll cost: each offsetHeight read forces a
  // synchronous reflow. Re-measuring is only needed when the rendered
  // window moved (new rows appeared) or the data changed (row content —
  // and thus height — may differ). A scroll within the same window, or
  // the recompute this effect itself triggers, must not re-measure every
  // visible row on every frame.
  const rowEls = useRef(new Map<number, HTMLElement>());
  useLayoutEffect(() => {
    let changed = false;
    for (const [i, el] of rowEls.current) {
      const h = el.offsetHeight;
      if (h > 0 && measured.current[i] !== h) {
        measured.current[i] = h;
        changed = true;
      }
    }
    if (changed) forceRecompute((n) => n + 1);
  }, [items, start, end]);

  // Drop stale measurements when the list shrinks so offsets don't carry
  // heights for indices that no longer exist.
  if (measured.current.length > count) measured.current.length = count;

  const setRowEl = useCallback(
    (i: number) =>
      (el: HTMLElement | null): void => {
        if (el) rowEls.current.set(i, el);
        else rowEls.current.delete(i);
      },
    [],
  );

  const rows: ComponentChild[] = [];
  for (let i = start; i < end; i++) {
    const item = items[i];
    if (item === undefined) continue;
    rows.push(
      <div
        key={i}
        ref={setRowEl(i)}
        style={{ position: "absolute", top: `${offsets[i]}px`, left: 0, right: 0 }}
      >
        {renderItem(item, i)}
      </div>,
    );
  }

  return (
    <div ref={containerRef} class={cls ? `virtual-list ${cls}` : "virtual-list"}>
      <div class="virtual-list-spacer" style={{ height: `${total}px`, position: "relative" }}>
        {rows}
      </div>
    </div>
  );
}
