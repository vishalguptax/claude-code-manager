/**
 * Panel liveness check.
 *
 * A webview that dies — script crash, renderer kill, document replaced —
 * leaves a blank panel and says nothing: no exception reaches the host, no
 * error reaches the log, and the user is left reporting "it went blank" with
 * nothing to attach. The host cannot see the panel's DOM, so it asks.
 *
 * After each settings push the host pings the panel; a live app answers with a
 * census of what it believes it rendered. The answer (or the silence) goes to
 * the output channel, so the state of the panel at the moment of a blank
 * screen is a recorded fact rather than a guess.
 */
import { recordError } from "./errorLog";

/** Reply deadline. Generous: a busy renderer must not be called dead. */
export const PONG_TIMEOUT_MS = 3000;

export interface PongCensus {
  id: number;
  tabs: number;
  rootLength: number;
  activeTab: string;
  errors: number;
  /** Geometry and computed styles — a rendered-but-invisible panel is a
   *  distinct failure from a dead one, and only these tell them apart. */
  details?: string;
}

interface PendingPing {
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
}

const pending = new Map<number, PendingPing>();
let nextId = 1;

/**
 * Ping the panel and log what comes back. `post` sends the message; the
 * caller wires it to the webview so this module stays free of vscode.
 */
export function pingWebview(post: (msg: { type: "ping"; id: number }) => void, reason: string): void {
  const id = nextId++;
  const timer = setTimeout(() => {
    pending.delete(id);
    // The panel did not answer. This is the blank-screen fingerprint: the
    // host is alive (it ran this timer) and the webview is not.
    recordError({
      at: Date.now(),
      source: "health",
      message: `Panel did not answer the health check within ${PONG_TIMEOUT_MS}ms after ${reason} — the webview is not running.`,
    });
  }, PONG_TIMEOUT_MS);
  pending.set(id, { timer, sentAt: Date.now() });
  post({ type: "ping", id });
}

/**
 * Handle a reply. Returns the log line, or undefined when the id is unknown
 * (a late answer to a ping already declared dead — worth knowing, so it is
 * recorded too).
 */
export function handlePong(census: PongCensus): string {
  const entry = pending.get(census.id);
  if (entry) {
    clearTimeout(entry.timer);
    pending.delete(census.id);
  }
  const rtt = entry ? `${Date.now() - entry.sentAt}ms` : "late";
  const line =
    `Panel health (${rtt}): tabs=${census.tabs} rootLength=${census.rootLength} ` +
    `activeTab=${census.activeTab} errors=${census.errors}` +
    (census.details ? ` ${census.details}` : "");
  // An empty document with a live script is its own distinct failure: the app
  // is running but has rendered nothing, which no exception would reveal.
  if (census.rootLength === 0 || census.tabs === 0) {
    recordError({ at: Date.now(), source: "health", message: `${line} — the panel rendered nothing.` });
  }
  return line;
}

/** Test-only: drop pending pings and reset the id sequence. */
export function _resetHealthCheck(): void {
  for (const { timer } of pending.values()) clearTimeout(timer);
  pending.clear();
  nextId = 1;
}
