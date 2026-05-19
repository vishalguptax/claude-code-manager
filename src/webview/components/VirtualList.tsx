/**
 * Windowed vertical list. Renders only items inside the viewport (plus overscan)
 * for constant-time scroll performance regardless of total item count.
 */
import type { ComponentChild } from "preact";
import { useRef } from "preact/hooks";
import { useVirtualizer } from "../hooks/useVirtualizer";

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ComponentChild;
  overscan?: number;
  class?: string;
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const { items, itemHeight, renderItem, overscan, class: cls } = props;
  const ref = useRef<HTMLDivElement>(null);
  const { startIndex, endIndex, totalHeight, offsetY } = useVirtualizer({
    itemCount: items.length,
    itemHeight,
    overscan,
    containerRef: ref,
  });

  const slice: ComponentChild[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    if (item === undefined) continue;
    slice.push(renderItem(item, i));
  }

  return (
    <div ref={ref} class={cls ? `virtual-list ${cls}` : "virtual-list"}>
      <div class="virtual-list-spacer" style={{ height: `${totalHeight}px`, position: "relative" }}>
        <div
          style={{ transform: `translateY(${offsetY}px)`, position: "absolute", left: 0, right: 0 }}
        >
          {slice}
        </div>
      </div>
    </div>
  );
}
