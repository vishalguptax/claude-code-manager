/**
 * Debounce a CALLBACK (not a value): returns a stable function that delays the
 * wrapped `fn`, collapsing a burst of calls into a single invocation `delay` ms
 * after the last one. Distinct from {@link useDebounce}, which debounces a value
 * a component already holds; this is for *side effects* fired imperatively from
 * an event handler — e.g. a host write that must not run per keystroke.
 *
 * Guarantees:
 * - The returned function identity is stable across renders, so it is safe to
 *   pass straight into an `onInput`/`onChange` without re-wiring listeners.
 * - The latest `fn` and `delay` are always used (held in a ref), so a closure
 *   captured this render never goes stale.
 * - `cancel()` drops any pending invocation.
 * - `flush()` runs a pending invocation immediately with its queued args.
 * - On unmount the pending invocation is FLUSHED, not dropped, so a save the
 *   user triggered mid-pause is not lost when they navigate away / switch tabs.
 */
import { useEffect, useMemo, useRef } from "preact/hooks";

/**
 * A generic side-effecting callback; the argument tuple is whatever the
 * caller's `fn` takes. `any[]` (not `unknown[]`) is deliberate — a debounce
 * wrapper is argument-agnostic, and `unknown[]` would reject every concrete
 * function passed in. (biome's noExplicitAny is off project-wide.)
 */
type AnyFn = (...args: any[]) => void;

export interface DebouncedCallback<F extends AnyFn> {
  (...args: Parameters<F>): void;
  /** Drop the pending invocation without running it. */
  cancel(): void;
  /** Run the pending invocation now (if any) with its queued args. */
  flush(): void;
}

export function useDebouncedCallback<F extends AnyFn>(fn: F, delay: number): DebouncedCallback<F> {
  // Hold the latest fn/delay so the stable wrapper never calls a stale closure.
  const fnRef = useRef(fn);
  const delayRef = useRef(delay);
  fnRef.current = fn;
  delayRef.current = delay;

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The args of the most recent pending call, so flush() can replay them.
  const pendingArgs = useRef<Parameters<F> | null>(null);

  const debounced = useMemo<DebouncedCallback<F>>(() => {
    const run = (...args: Parameters<F>): void => {
      pendingArgs.current = args;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        const queued = pendingArgs.current;
        pendingArgs.current = null;
        if (queued) fnRef.current(...queued);
      }, delayRef.current);
    };

    const wrapper = run as DebouncedCallback<F>;
    wrapper.cancel = (): void => {
      clearTimeout(timer.current);
      timer.current = undefined;
      pendingArgs.current = null;
    };
    wrapper.flush = (): void => {
      if (timer.current === undefined) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      const queued = pendingArgs.current;
      pendingArgs.current = null;
      if (queued) fnRef.current(...queued);
    };
    return wrapper;
  }, []);

  // Flush a pending save on unmount so navigating away mid-pause does not lose it.
  useEffect(() => () => debounced.flush(), [debounced]);

  return debounced;
}
