/**
 * Bounded skeletons: a skeleton that shimmers forever IS the
 * "user is clueless" problem. `useLoadPhase` grades how long a load has
 * been pending; `SlowLoadNotice` renders the honest state for it —
 * "taking longer than expected" with a Retry at 5s, "looks stuck" with
 * escalation guidance at 15s.
 *
 * Deadlines are derived from wall-clock timestamps on every tick, never
 * from accumulated timer callbacks — VS Code throttles timers in hidden
 * webviews, and a laptop can sleep mid-load. Worst case under either,
 * the next tick jumps straight to the correct phase; a resumed machine
 * shows "taking longer than expected" (retryable), never a stale
 * shimmer.
 */
import { useEffect, useState } from "preact/hooks";

export type LoadPhase = "fresh" | "slow" | "stuck";

/** Pending this long → offer a Retry. */
const SLOW_AFTER_MS = 5_000;
/** Pending this long → assume something is wrong and say so. */
const STUCK_AFTER_MS = 15_000;

/**
 * Grade a pending load. Resets whenever `pending` goes false (payload,
 * error, or empty state arrived — any resolution ends the wait).
 */
export function useLoadPhase(pending: boolean): LoadPhase {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<LoadPhase>("fresh");

  useEffect(() => {
    if (!pending) {
      setStartedAt(null);
      setPhase("fresh");
      return;
    }
    const start = Date.now();
    setStartedAt(start);
    return undefined;
  }, [pending]);

  useEffect(() => {
    if (startedAt === null) return;
    const evaluate = (): void => {
      const waited = Date.now() - startedAt;
      setPhase(waited >= STUCK_AFTER_MS ? "stuck" : waited >= SLOW_AFTER_MS ? "slow" : "fresh");
    };
    evaluate();
    const timer = setInterval(evaluate, 1_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return phase;
}

export interface SlowLoadNoticeProps {
  phase: LoadPhase;
  /** What's being waited on, e.g. "account data". */
  what: string;
  /** Re-send the original request. Must be an idempotent read. */
  onRetry: () => void;
}

/**
 * Status block shown INSTEAD of a skeleton once a load overruns its
 * deadline. Renders nothing while the phase is fresh, so callers can
 * unconditionally compose it above their skeleton.
 */
export function SlowLoadNotice({ phase, what, onRetry }: SlowLoadNoticeProps) {
  // In-flight guard: one retry per click; re-enabled a beat later so a
  // genuinely dead host can still be retried, but hammering can't queue
  // a parse per click.
  const [retryBusy, setRetryBusy] = useState(false);
  useEffect(() => {
    if (!retryBusy) return;
    const t = setTimeout(() => setRetryBusy(false), 3_000);
    return () => clearTimeout(t);
  }, [retryBusy]);

  if (phase === "fresh") return null;

  const retry = (): void => {
    setRetryBusy(true);
    onRetry();
  };

  return (
    <div class="load-notice" role="status">
      <div class="load-notice-title">
        {phase === "stuck" ? `Loading ${what} looks stuck` : `Still loading ${what}…`}
      </div>
      <div class="load-notice-hint">
        {phase === "stuck"
          ? "Retry below — if it stays stuck, check Output → Extension Host for [claude-manager] lines, or reload the window."
          : "Taking longer than expected."}
      </div>
      <button class="btn load-notice-retry" disabled={retryBusy} onClick={retry}>
        {retryBusy ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
