/**
 * Cooperate with Claude Code's own advisory locks while we rewrite the files
 * it owns.
 *
 * The race this closes is real and silent. Claude Code refreshes its OAuth
 * token by reading the credentials, refreshing over the network, and saving
 * the result — and the whole sequence runs under its locks. A profile switch
 * that lands inside that window is overwritten by the refreshed token for the
 * account we just left: the user ends up back on the old account, and the
 * backup we took a moment earlier holds a refresh token the server has already
 * rotated away, which makes that saved profile unusable later.
 *
 * Writing atomically does not help. Our `tmp+rename` guarantees nobody sees a
 * half-written file; it does not stop Claude Code from writing *after* us with
 * data it read *before* us. Only taking the same locks orders the two writers.
 *
 * The protocol is Claude Code's, observed from its own behaviour:
 *   - The lock is a DIRECTORY. `mkdir` is the mutex — it either creates or
 *     fails with EEXIST, atomically, on every platform we support.
 *   - A holder proves it is alive by touching the directory's mtime. A lock
 *     whose mtime is older than its stale window is abandoned and may be
 *     reclaimed, which is what stops a crashed process from wedging the file
 *     forever.
 *   - The credential path takes two locks, primary then legacy, and the
 *     config file has its own.
 *
 * Where we deliberately differ from a straight port: acquisition is bounded
 * and reports WHY it failed instead of pressing on. A swap that cannot take
 * the lock is a swap that would race, so the caller is told to ask the user to
 * retry rather than quietly corrupting a profile. Being unable to switch for a
 * few seconds is recoverable; losing a refresh token is not.
 */
import * as fs from "fs";
import * as path from "path";
import { CLAUDE_DIR } from "../../core/config";

/**
 * Every lock path derives from CLAUDE_DIR rather than from `os.homedir()`
 * directly, so a test that redirects the config module also redirects the
 * locks. Deriving them independently would have unit tests creating lock
 * directories in the developer's real home and racing their actual Claude
 * Code.
 *
 * Claude Code's config file is a sibling of its config directory
 * (`~/.claude` and `~/.claude.json`), and the legacy credential lock is that
 * directory's name plus `.lock`.
 */
const CLAUDE_JSON = `${CLAUDE_DIR}.json`;

/**
 * One advisory lock: where it lives, and how long before a holder is presumed
 * dead. The stale windows differ per lock because Claude Code chose different
 * ones — the credential locks guard a network round-trip and tolerate a
 * minute, the config lock guards a local write and does not.
 */
export interface LockSpec {
  readonly dir: string;
  readonly staleMs: number;
}

/**
 * Credential locks, in the order Claude Code takes them. Order matters: two
 * processes taking the same pair in opposite orders deadlock, so this array is
 * the acquisition order and release runs in reverse.
 */
export const CREDENTIAL_LOCKS: readonly LockSpec[] = [
  { dir: path.join(CLAUDE_DIR, ".oauth_refresh.lock"), staleMs: 60_000 },
  // Legacy sibling of the config directory (~/.claude.lock), kept by Claude
  // Code for compatibility with external tools — which is exactly what we are.
  { dir: `${CLAUDE_DIR}.lock`, staleMs: 60_000 },
];

/** Lock guarding `~/.claude.json`. Shorter window: no network call under it. */
export const CONFIG_LOCK: LockSpec = {
  dir: `${CLAUDE_JSON}.lock`,
  staleMs: 10_000,
};

/** How often a holder touches the lock to prove it is still alive. */
const HEARTBEAT_MS = 5_000;
/** How long to wait for a lock before giving up. */
const ACQUIRE_TIMEOUT_MS = 3_000;
/** Gap between acquisition attempts. */
const RETRY_INTERVAL_MS = 120;

export type LockFailure =
  /** Held by a live holder for the whole timeout — almost always a refresh. */
  | { reason: "busy"; lock: string }
  /** The lock directory could not be created for a non-contention reason. */
  | { reason: "unavailable"; lock: string; detail: string };

function mtimeMs(dir: string): number | null {
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Try once to take `spec`.
 *
 * Returns "taken", "held" (someone alive has it), or an error. A lock whose
 * mtime has aged past its stale window is reclaimed by removing it and
 * retrying the create — the removal is guarded so that losing the race to
 * another reclaimer reads as "held" rather than as success.
 */
function tryAcquire(spec: LockSpec): "taken" | "held" | { detail: string } {
  try {
    fs.mkdirSync(spec.dir);
    return "taken";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      return { detail: (err as Error).message };
    }
  }

  const age = mtimeMs(spec.dir);
  // Vanished between mkdir and stat: the holder released it. Say "held" so the
  // caller retries through the normal path rather than special-casing a race.
  if (age === null) return "held";
  if (Date.now() - age < spec.staleMs) return "held";

  try {
    fs.rmdirSync(spec.dir);
  } catch {
    // Another process reclaimed it first, or it is no longer empty. Either way
    // it is not ours to take on this attempt.
    return "held";
  }
  try {
    fs.mkdirSync(spec.dir);
    return "taken";
  } catch {
    return "held";
  }
}

/**
 * Hold `specs` for the duration of `work`, then release them.
 *
 * Locks are taken in array order and released in reverse. If any lock cannot
 * be taken, every lock already held is released before returning, so a failed
 * acquisition never leaves a partial set behind for the stale timer to clean
 * up.
 *
 * `work` runs only when every lock is held. Its result is returned as-is; a
 * throw propagates after the locks are released.
 */
export function withLocks<T>(
  specs: readonly LockSpec[],
  work: () => T,
): { ok: true; value: T } | { ok: false; failure: LockFailure } {
  const held: LockSpec[] = [];
  const heartbeats: ReturnType<typeof setInterval>[] = [];

  const releaseAll = (): void => {
    for (const timer of heartbeats.splice(0)) clearInterval(timer);
    // Reverse order: the mirror of acquisition, so a watcher never sees us
    // holding the legacy lock without the primary.
    for (const spec of held.splice(0).reverse()) {
      try {
        fs.rmdirSync(spec.dir);
      } catch {
        // Already gone (reclaimed as stale while we were slow). Nothing to do:
        // the work is finished either way.
      }
    }
  };

  for (const spec of specs) {
    const deadline = Date.now() + ACQUIRE_TIMEOUT_MS;
    let taken = false;

    for (;;) {
      const result = tryAcquire(spec);
      if (result === "taken") {
        taken = true;
        break;
      }
      if (typeof result === "object") {
        releaseAll();
        return { ok: false, failure: { reason: "unavailable", lock: spec.dir, detail: result.detail } };
      }
      if (Date.now() >= deadline) break;
      // Synchronous wait: this whole path runs inside one host-side command and
      // must stay ordered relative to the file writes it guards. A promise here
      // would let the extension host interleave another swap between our
      // acquisition and our write, which is the race we are closing.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_INTERVAL_MS);
    }

    if (!taken) {
      releaseAll();
      return { ok: false, failure: { reason: "busy", lock: spec.dir } };
    }

    held.push(spec);
    // Keep proving we are alive. A Keychain write can outlast the config
    // lock's 10s window, and a lock we let go stale could be reclaimed by
    // Claude Code mid-write — the exact interleaving we are here to prevent.
    const timer = setInterval(() => {
      const now = new Date();
      try {
        fs.utimesSync(spec.dir, now, now);
      } catch {
        // The directory is gone; the interval is cleared on release anyway.
      }
    }, HEARTBEAT_MS);
    // Never hold the event loop open for a lock heartbeat.
    timer.unref?.();
    heartbeats.push(timer);
  }

  try {
    return { ok: true, value: work() };
  } finally {
    releaseAll();
  }
}

/** Human-readable reason, for surfacing a retry to the user. */
export function describeLockFailure(failure: LockFailure): string {
  return failure.reason === "busy"
    ? "Claude Code is refreshing its credentials right now. Try again in a moment."
    : `Could not coordinate with Claude Code (${failure.detail}).`;
}
