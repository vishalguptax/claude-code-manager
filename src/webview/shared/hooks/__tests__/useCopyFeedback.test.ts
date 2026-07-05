/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCopyFeedback } from "../useCopyFeedback";

describe("useCopyFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });
  afterEach(() => vi.useRealTimers());

  it("writes the text to the clipboard and flips copied to true", () => {
    const { result } = renderHook(() => useCopyFeedback());
    expect(result.current.copied).toBe(false);
    act(() => result.current.copy("hello"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(result.current.copied).toBe(true);
  });

  it("reverts to false after the default 1000ms duration", () => {
    const { result } = renderHook(() => useCopyFeedback());
    act(() => result.current.copy("x"));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(999));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("honours a custom duration", () => {
    const { result } = renderHook(() => useCopyFeedback(1200));
    act(() => result.current.copy("x"));
    act(() => vi.advanceTimersByTime(1199));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("restarts the timer on a second copy before the first reverts", () => {
    const { result } = renderHook(() => useCopyFeedback(1000));
    act(() => result.current.copy("a"));
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current.copy("b")); // restarts the 1000ms window
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.copied).toBe(true); // only 700ms since the 2nd copy
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.copied).toBe(false);
  });

  it("clears the pending timeout on unmount (no setState-after-unmount)", () => {
    const { result, unmount } = renderHook(() => useCopyFeedback());
    act(() => result.current.copy("x"));
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
