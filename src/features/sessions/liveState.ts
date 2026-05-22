/**
 * Process-death poller for live-session indicators.
 *
 * A FileSystemWatcher never fires when a CLI process dies hard (no FS
 * event for process exit, and the CLI leaves its PID file behind), so we
 * re-check liveness on a slow tick to flip the green dot off in finite
 * time. The poll is meant to be paused while the webview is hidden —
 * there is no UI to update, so the tick would be pure CPU waste.
 *
 * State is held in a small handle rather than module-globals so a single
 * extension host can drive independent pollers per webview lifecycle
 * without leaking timers across resolves.
 */

/**
 * Poll interval (ms) for process-death detection. The CLI heartbeats
 * its PID file every few seconds, so any death within ~one heartbeat
 * window is caught by the FS watcher; the poller exists for the
 * fallback case where the CLI is killed hard and the PID file is
 * never touched again.
 *
 * Cost per tick: one `readdirSync` + a handful of `readFileSync` +
 * `process.kill(pid, 0)` calls — well under a millisecond even with
 * dozens of sessions.
 */
export const LIVE_POLL_INTERVAL_MS = 4000;

/** Opaque handle owning the poll timer for one webview lifecycle. */
export interface LivePoll {
  /** Start ticking if not already running. Idempotent. */
  start(): void;
  /** Stop ticking and clear the timer. Idempotent. */
  stop(): void;
}

/**
 * Create a process-death poller that invokes `onTick` every
 * `intervalMs`. The timer is `unref`'d so it never keeps the Node event
 * loop alive on its own — VS Code's extension host outlives any single
 * feature's timers, and test harnesses that forget to stop the poll
 * should still exit cleanly.
 */
export function createLivePoll(
  onTick: () => void,
  intervalMs: number = LIVE_POLL_INTERVAL_MS,
): LivePoll {
  let timer: NodeJS.Timeout | undefined;
  return {
    start(): void {
      if (timer) return;
      timer = setInterval(onTick, intervalMs);
      timer.unref?.();
    },
    stop(): void {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
