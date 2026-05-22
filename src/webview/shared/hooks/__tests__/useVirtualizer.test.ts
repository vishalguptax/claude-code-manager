/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/preact";
import { useRef } from "preact/hooks";
import { useVirtualizer } from "../useVirtualizer";

describe("useVirtualizer", () => {
  it("computes totalHeight from itemCount and itemHeight", () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      return useVirtualizer({ itemCount: 100, itemHeight: 30, containerRef: ref });
    });
    expect(result.current.totalHeight).toBe(3000);
    expect(result.current.startIndex).toBeGreaterThanOrEqual(0);
  });

  it("falls back to a non-empty window when the container is unmeasured (0px tall)", () => {
    // No element is attached, so clientHeight is never read as > 0. The hook
    // must still surface a usable window rather than nothing.
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      return useVirtualizer({ itemCount: 100, itemHeight: 30, overscan: 4, containerRef: ref });
    });
    expect(result.current.endIndex).toBeGreaterThan(result.current.startIndex);
  });

  it("sizes the window from a measured container height", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 300 });
    document.body.appendChild(el);
    const ref = { current: el };
    const { result } = renderHook(() =>
      useVirtualizer({ itemCount: 100, itemHeight: 30, overscan: 0, containerRef: ref }),
    );
    // 300px / 30px = 10 rows visible from the top, plus the slice end clamp.
    expect(result.current.endIndex).toBe(10);
    document.body.removeChild(el);
  });
});
