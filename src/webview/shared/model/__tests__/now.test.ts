import { afterEach, describe, expect, it, vi } from "vitest";
import { now, startNowTicker } from "../now";

describe("startNowTicker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances `now` on each interval and stops on dispose", () => {
    vi.useFakeTimers();
    const before = now.value;
    const stop = startNowTicker(1000);

    vi.setSystemTime(before + 1000);
    vi.advanceTimersByTime(1000);
    expect(now.value).toBeGreaterThan(before);

    const afterStop = now.value;
    stop();
    vi.setSystemTime(afterStop + 5000);
    vi.advanceTimersByTime(5000);
    // No further updates once disposed.
    expect(now.value).toBe(afterStop);
  });

  it("runs only one interval even if started twice", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");
    const a = startNowTicker(1000);
    const b = startNowTicker(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    a();
    b();
    spy.mockRestore();
  });
});
