/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedCallback } from "../useDebouncedCallback";

describe("useDebouncedCallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("invokes the callback once, after the delay, with the latest args", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));
    act(() => {
      result.current("a");
      result.current("b");
      result.current("c");
    });
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("returns a stable function identity across renders", () => {
    const { result, rerender } = renderHook(({ d }: { d: number }) => useDebouncedCallback(vi.fn(), d), {
      initialProps: { d: 300 },
    });
    const first = result.current;
    rerender({ d: 500 });
    expect(result.current).toBe(first);
  });

  it("always calls the latest fn even if it changed since the call was queued", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ fn }: { fn: () => void }) => useDebouncedCallback(fn, 200), {
      initialProps: { fn: first },
    });
    act(() => result.current());
    rerender({ fn: second });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancel() drops the pending invocation", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));
    act(() => {
      result.current("x");
      result.current.cancel();
      vi.advanceTimersByTime(200);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("flush() runs the pending invocation immediately and is idempotent", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 200));
    act(() => {
      result.current("y");
      result.current.flush();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("y");
    // A second flush with nothing pending is a no-op.
    act(() => result.current.flush());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flushes a pending invocation on unmount so a mid-pause call is not lost", () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300));
    act(() => result.current("save-me"));
    expect(fn).not.toHaveBeenCalled();
    act(() => unmount());
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("save-me");
  });
});
