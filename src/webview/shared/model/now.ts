/**
 * Shared wall-clock signal for time-derived UI.
 *
 * Relative timestamps ("5m ago") and countdowns ("resets in 1h") are computed
 * from the current time at render, but nothing re-renders as the clock moves —
 * so they freeze until some unrelated data change. One app-level ticker bumps
 * this signal on a coarse interval; any view that reads `now.value` while
 * formatting a time re-renders on each tick and stays live, without every
 * component owning its own interval.
 */
import { signal } from "@preact/signals";

/** Current wall-clock (ms epoch), refreshed by the shared ticker. */
export const now = signal(Date.now());

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Start the shared ticker. Idempotent — a second call is a no-op so the app
 * never runs more than one interval. Returns a disposer for symmetry/tests;
 * in the live app the panel owns it for its lifetime.
 */
export function startNowTicker(intervalMs = 30_000): () => void {
  if (!timer) {
    timer = setInterval(() => {
      now.value = Date.now();
    }, intervalMs);
  }
  return () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
