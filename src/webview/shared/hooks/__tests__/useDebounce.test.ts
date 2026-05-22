/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useDebounce } from "../useDebounce";

describe("useDebounce", () => {
  it("returns the initial value synchronously", () => {
    const { result } = renderHook(() => useDebounce("a", 50));
    expect(result.current).toBe("a");
  });

  it("eventually updates to the new value after the delay", async () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 10), {
      initialProps: { v: "a" },
    });
    rerender({ v: "b" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(result.current).toBe("b");
  });
});
