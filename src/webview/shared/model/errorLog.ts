/**
 * In-memory record of everything that went wrong in this webview session.
 *
 * A panel is not a browser tab: there is no console in reach, so an error the
 * user can see is the only error they can report. Every failure path in the
 * webview funnels here — render crashes (ErrorBoundary), escaped exceptions
 * (crashSurface), rejected host messages and handler throws (messageBus) —
 * and the host mirrors the same entries into its output channel, which is
 * what a bug report is built from.
 *
 * Bounded on purpose: one bad render can throw on every frame, and an
 * unbounded log would turn that into a memory leak on top of a bug.
 */

export interface ErrorEntry {
  /** Epoch ms, so the host can order its own entries against these. */
  at: number;
  /** Where it came from: "render", "window", "promise", "message", "handler". */
  source: string;
  message: string;
  stack?: string;
}

/** Keep the most recent failures; a cascade must not grow without bound. */
const MAX_ENTRIES = 25;

const entries: ErrorEntry[] = [];

/** Notified for each new entry — the host bridge, wired in main.tsx. */
let sink: ((entry: ErrorEntry) => void) | null = null;

/**
 * Register the forwarder that mirrors entries to the extension host. Kept as
 * a setter rather than an import so this module stays free of the postMessage
 * bridge (and therefore testable without one).
 */
export function setErrorSink(fn: ((entry: ErrorEntry) => void) | null): void {
  sink = fn;
}

/** Normalise anything thrown into a loggable entry. */
function toEntry(source: string, err: unknown): ErrorEntry {
  if (err instanceof Error) {
    return { at: Date.now(), source, message: `${err.name}: ${err.message}`, stack: err.stack };
  }
  return { at: Date.now(), source, message: String(err) };
}

/**
 * Record a failure and forward it to the host. Never throws: it is called
 * from catch blocks, and a reporting failure must not replace the error being
 * reported.
 */
export function recordError(source: string, err: unknown): ErrorEntry {
  const entry = toEntry(source, err);
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  try {
    sink?.(entry);
  } catch {
    // The host bridge is best-effort; the in-memory log is the fallback.
  }
  return entry;
}

/** Everything recorded this session, oldest first. */
export function getErrorLog(): readonly ErrorEntry[] {
  return entries;
}

/** Render the log as the plain text a user can copy into a bug report. */
export function formatErrorLog(log: readonly ErrorEntry[] = entries): string {
  if (log.length === 0) return "No errors recorded.";
  return log
    .map((e) => {
      const when = new Date(e.at).toISOString();
      return `[${when}] (${e.source}) ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
    })
    .join("\n\n");
}

/** Test-only: drop every entry and the sink. */
export function _resetErrorLog(): void {
  entries.length = 0;
  sink = null;
}
