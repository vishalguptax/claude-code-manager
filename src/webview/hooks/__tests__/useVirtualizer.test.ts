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
});
