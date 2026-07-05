// @vitest-environment happy-dom
import { render } from "preact";
import { useState } from "preact/hooks";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlowLoadNotice, useLoadPhase, type LoadPhase } from "./LoadDeadline";

let container: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
  vi.useRealTimers();
});

/** Test host exposing the hook's phase + a pending toggle. */
function Probe({ initialPending }: { initialPending: boolean }) {
  const [pending, setPending] = useState(initialPending);
  const phase = useLoadPhase(pending);
  return (
    <div>
      <span data-testid="phase">{phase}</span>
      <button data-testid="resolve" onClick={() => setPending(false)} />
    </div>
  );
}

function phaseText(): string {
  return container.querySelector('[data-testid="phase"]')!.textContent ?? "";
}

describe("useLoadPhase", () => {
  it("stays fresh under the deadline", () => {
    act(() => render(<Probe initialPending={true} />, container));
    act(() => void vi.advanceTimersByTime(4_000));
    expect(phaseText()).toBe("fresh");
  });

  it("escalates fresh → slow → stuck on wall-clock time", () => {
    act(() => render(<Probe initialPending={true} />, container));
    act(() => void vi.advanceTimersByTime(6_000));
    expect(phaseText()).toBe("slow");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(phaseText()).toBe("stuck");
  });

  it("jumps straight to the correct phase after a long timer gap (sleep / hidden-tab throttle)", () => {
    act(() => render(<Probe initialPending={true} />, container));
    // One giant tick, as after system sleep: no intermediate 1s ticks ran.
    act(() => void vi.advanceTimersByTime(60_000));
    expect(phaseText()).toBe("stuck");
  });

  it("resets when the load resolves", () => {
    act(() => render(<Probe initialPending={true} />, container));
    act(() => void vi.advanceTimersByTime(6_000));
    expect(phaseText()).toBe("slow");
    act(() => {
      (container.querySelector('[data-testid="resolve"]') as HTMLButtonElement).click();
    });
    expect(phaseText()).toBe("fresh");
  });

  it("never leaves fresh while not pending", () => {
    act(() => render(<Probe initialPending={false} />, container));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(phaseText()).toBe("fresh");
  });
});

describe("SlowLoadNotice", () => {
  function mount(phase: LoadPhase, onRetry: () => void): void {
    act(() => render(<SlowLoadNotice phase={phase} what="account data" onRetry={onRetry} />, container));
  }

  it("renders nothing while fresh", () => {
    mount("fresh", () => {});
    expect(container.querySelector(".load-notice")).toBeNull();
  });

  it("offers a retry when slow", () => {
    const retry = vi.fn();
    mount("slow", retry);
    expect(container.textContent).toContain("Still loading account data");
    (container.querySelector(".load-notice-retry") as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("escalates copy when stuck", () => {
    mount("stuck", () => {});
    expect(container.textContent).toContain("looks stuck");
    expect(container.textContent).toContain("Extension Host");
  });

  it("guards against retry hammering, then re-arms", () => {
    const retry = vi.fn();
    mount("slow", retry);
    const btn = (): HTMLButtonElement =>
      container.querySelector(".load-notice-retry") as HTMLButtonElement;
    act(() => btn().click());
    expect(btn().disabled).toBe(true);
    act(() => btn().click());
    expect(retry).toHaveBeenCalledTimes(1);
    // Re-armed after the guard window so a dead host stays retryable.
    act(() => void vi.advanceTimersByTime(3_100));
    expect(btn().disabled).toBe(false);
  });
});
