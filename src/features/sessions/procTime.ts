/**
 * Best-effort OS process start-time lookup, used to defeat PID reuse when
 * deciding whether a recorded PID still names the *same* process that wrote a
 * file referencing it.
 *
 * `process.kill(pid, 0)` only proves *some* process owns the PID right now.
 * PIDs recycle — quickly on Windows — so an orphaned PID reference can point
 * at an unrelated live process and read as "still running" forever. Comparing
 * the OS-reported start time against a recorded timestamp distinguishes the
 * real process from a recycled PID.
 *
 * NON-BLOCKING BY DESIGN. The OS query spawns a subprocess on Windows/macOS,
 * which must never run synchronously on the extension-host event loop (it would
 * stall every UI action for the spawn duration). So:
 *
 *   - `getProcessStartTimes(pids)` is synchronous and returns ONLY what is
 *     already cached — it never spawns. Misses trigger a fire-and-forget async
 *     refresh so the next call sees fresh values. Callers on hot paths (the
 *     live-session poll) get eventual consistency within one tick with zero
 *     event-loop stall.
 *   - `getProcessStartTimesAsync(pids)` awaits a refresh of any stale PIDs and
 *     is for callers that can await a definitive answer.
 *
 * Both return unix-epoch milliseconds per PID; a PID absent from the result
 * means the start time is not (yet) known. Callers MUST treat "unknown" as
 * "cannot disambiguate" and fall back to the plain liveness check rather than
 * dropping a possibly-live entry.
 */
import * as fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileP = promisify(execFile);

/**
 * Memo TTL. A live process's start time is immutable, so re-querying every
 * tick would be waste; the TTL still bounds how long a freshly-reused PID can
 * masquerade before we re-check — at most one TTL window.
 */
const TTL_MS = 5000;

/** Max time to wait on a subprocess query before giving up (→ unknown). */
const QUERY_TIMEOUT_MS = 4000;

interface Entry {
  /** unix ms, or null when the query positively failed for this PID. */
  startMs: number | null;
  /** Date.now() when this entry was recorded. */
  at: number;
}

const cache = new Map<number, Entry>();
/** PIDs with an async refresh in flight — dedupes concurrent queries. */
const inflight = new Set<number>();

function isFresh(entry: Entry | undefined, now: number): boolean {
  return entry !== undefined && now - entry.at < TTL_MS;
}

/**
 * Synchronous, non-blocking. Returns cached start times only; schedules an
 * async refresh for anything missing or stale so a subsequent call sees it.
 */
export function getProcessStartTimes(pids: number[]): Map<number, number> {
  const out = new Map<number, number>();
  const now = Date.now();
  const stale: number[] = [];

  for (const pid of pids) {
    const e = cache.get(pid);
    if (isFresh(e, now)) {
      if (e!.startMs !== null) out.set(pid, e!.startMs);
    } else {
      stale.push(pid);
    }
  }

  if (stale.length > 0) void refresh(stale);
  return out;
}

/**
 * Awaits a refresh of any missing/stale PIDs, then returns cached start times.
 * Use from callers already on an async path that want a definitive answer.
 */
export async function getProcessStartTimesAsync(pids: number[]): Promise<Map<number, number>> {
  const now = Date.now();
  const stale = pids.filter((pid) => !isFresh(cache.get(pid), now));
  if (stale.length > 0) await refresh(stale);

  const out = new Map<number, number>();
  for (const pid of pids) {
    const e = cache.get(pid);
    if (e && e.startMs !== null) out.set(pid, e.startMs);
  }
  return out;
}

/** Query the OS for the given PIDs and fold the results into the cache. */
async function refresh(pids: number[]): Promise<void> {
  const todo = pids.filter((p) => !inflight.has(p));
  if (todo.length === 0) return;
  for (const p of todo) inflight.add(p);
  try {
    const fresh = await queryStartTimes(todo);
    const now = Date.now();
    for (const p of todo) cache.set(p, { startMs: fresh.get(p) ?? null, at: now });
    pruneCache(now);
  } finally {
    for (const p of todo) inflight.delete(p);
  }
}

/** Drop cache entries older than one TTL so it cannot grow without bound. */
function pruneCache(now: number): void {
  for (const [pid, e] of cache) {
    if (now - e.at >= TTL_MS) cache.delete(pid);
  }
}

function queryStartTimes(pids: number[]): Promise<Map<number, number>> {
  switch (process.platform) {
    case "linux":
      return queryLinux(pids);
    case "darwin":
      return queryDarwin(pids);
    case "win32":
      return queryWindows(pids);
    default:
      return Promise.resolve(new Map());
  }
}

/**
 * Linux: the `/proc/<pid>` directory inode is stamped at process creation and
 * its mtime is stable for the process lifetime, so an async `stat` reads the
 * start time with no subprocess spawn and no dependence on `USER_HZ` (which the
 * `/proc/<pid>/stat` jiffies approach would need and Node cannot query).
 */
async function queryLinux(pids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  await Promise.all(
    pids.map(async (pid) => {
      try {
        const st = await fs.promises.stat(`/proc/${pid}`);
        out.set(pid, st.mtimeMs);
      } catch {
        // Process gone or /proc unreadable — leave unknown.
      }
    }),
  );
  return out;
}

/**
 * macOS: no `/proc`, so shell out to `ps`. `lstart` is a full local-time date
 * string ("Wed Jul  1 11:39:30 2026") that `Date.parse` reads as local time,
 * yielding the correct UTC ms. One call covers every PID.
 */
async function queryDarwin(pids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  try {
    const { stdout } = await execFileP("ps", ["-o", "pid=,lstart=", "-p", pids.join(",")], {
      encoding: "utf-8",
      timeout: QUERY_TIMEOUT_MS,
    });
    for (const line of stdout.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!m) continue;
      const pid = Number(m[1]);
      const ms = Date.parse(m[2]);
      if (Number.isFinite(pid) && Number.isFinite(ms)) out.set(pid, ms);
    }
  } catch {
    // ps missing or timed out — leave all unknown.
  }
  return out;
}

/**
 * Windows: query the CIM process table. `Win32_Process.CreationDate` is the
 * exact fork time; casting through `[DateTimeOffset]` yields UTC unix ms
 * directly. CIM is used over `Get-Process().StartTime` because the latter
 * throws "Access denied" for processes owned by other users, which would make
 * unrelated live PIDs look unknown (and thus be wrongly trusted).
 */
async function queryWindows(pids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const filter = pids.map((p) => `ProcessId=${p}`).join(" or ");
  const script =
    `Get-CimInstance Win32_Process -Filter '${filter}' | ` +
    "ForEach-Object { $_.ProcessId.ToString() + ' ' + " +
    "([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }";
  try {
    const { stdout } = await execFileP(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf-8", timeout: QUERY_TIMEOUT_MS, windowsHide: true },
    );
    for (const line of stdout.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!m) continue;
      out.set(Number(m[1]), Number(m[2]));
    }
  } catch {
    // powershell unavailable or timed out — leave all unknown.
  }
  return out;
}

/** Test-only: reset the memo between cases. */
export function _clearProcStartCache(): void {
  cache.clear();
  inflight.clear();
}
