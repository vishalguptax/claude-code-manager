/**
 * Copies text to the clipboard and tracks a transient "copied" flag, so a
 * copy button can flip its label/icon for a beat then revert. Every feature
 * (sessions, hooks, commands, skills) reimplemented this as its own
 * `useState` + `navigator.clipboard.writeText` + `setTimeout`, each with a
 * different, undocumented-as-different duration (900/1000/1200ms) and none
 * of them clearing the timeout on unmount — the timeout fired setCopied on
 * an unmounted component if the user navigated away mid-flash. One hook, one
 * duration, cleaned up.
 */
import { useEffect, useRef, useState } from "preact/hooks";

/** Standard "copied" flash duration, matching the majority of prior call sites. */
const DEFAULT_DURATION_MS = 1000;

export interface UseCopyFeedback {
  /** True for `durationMs` after the most recent successful `copy()` call. */
  copied: boolean;
  /** Write `text` to the clipboard and flip `copied` for `durationMs`. */
  copy: (text: string) => void;
}

export function useCopyFeedback(durationMs: number = DEFAULT_DURATION_MS): UseCopyFeedback {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = (text: string): void => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), durationMs);
  };

  return { copied, copy };
}
