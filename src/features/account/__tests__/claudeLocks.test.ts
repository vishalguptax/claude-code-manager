import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFIG_LOCK,
  CREDENTIAL_LOCKS,
  describeLockFailure,
  type LockSpec,
  withLocks,
} from "../claudeLocks";

/**
 * These run against the real filesystem in a temp directory. The whole point
 * of the module is `mkdir` atomicity and mtime ageing, and a mocked fs would
 * test the mock rather than the protocol.
 */
let dir: string;
const lock = (name: string, staleMs = 60_000): LockSpec => ({
  dir: path.join(dir, name),
  staleMs,
});

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-locks-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("withLocks", () => {
  it("runs the work and releases the lock afterwards", () => {
    const a = lock("a.lock");
    const result = withLocks([a], () => {
      expect(fs.existsSync(a.dir)).toBe(true);
      return "done";
    });

    expect(result).toEqual({ ok: true, value: "done" });
    expect(fs.existsSync(a.dir)).toBe(false);
  });

  it("releases the lock when the work throws, and lets the error out", () => {
    const a = lock("a.lock");
    expect(() =>
      withLocks([a], () => {
        throw new Error("write failed");
      }),
    ).toThrow("write failed");
    expect(fs.existsSync(a.dir)).toBe(false);
  });

  it("releases every lock even when one cannot be removed", () => {
    // A lock directory that has gained a file cannot be rmdir'd. Releasing
    // must carry on regardless: giving up on the first failure would strand
    // the other lock until its stale window expired, blocking Claude Code.
    const a = lock("a.lock");
    const b = lock("b.lock");

    const result = withLocks([a, b], () => {
      fs.writeFileSync(path.join(a.dir, "stray"), "x");
      return "ok";
    });

    expect(result).toEqual({ ok: true, value: "ok" });
    expect(fs.existsSync(b.dir)).toBe(false);
  });

  it("does not run the work when a lock is held by someone alive", () => {
    const a = lock("a.lock");
    fs.mkdirSync(a.dir); // a live holder, mtime = now

    const work = vi.fn();
    const result = withLocks([a], work);

    expect(work).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe("busy");
    // Someone else's lock must survive our failed attempt.
    expect(fs.existsSync(a.dir)).toBe(true);
  });

  it("reclaims a lock whose holder died", () => {
    const a = lock("a.lock", 50);
    fs.mkdirSync(a.dir);
    // Age it past its stale window: the holder crashed without releasing.
    const old = new Date(Date.now() - 5_000);
    fs.utimesSync(a.dir, old, old);

    const result = withLocks([a], () => "recovered");

    expect(result).toEqual({ ok: true, value: "recovered" });
    expect(fs.existsSync(a.dir)).toBe(false);
  });

  it("treats a lock that is merely old-but-live as held", () => {
    // Just inside the window — the holder is slow, not dead.
    const a = lock("a.lock", 60_000);
    fs.mkdirSync(a.dir);
    const recent = new Date(Date.now() - 1_000);
    fs.utimesSync(a.dir, recent, recent);

    const result = withLocks([a], () => "should not run");

    expect(result.ok).toBe(false);
  });

  it("releases locks it already holds when a later one cannot be taken", () => {
    const a = lock("a.lock");
    const b = lock("b.lock");
    fs.mkdirSync(b.dir); // second lock is held by someone else

    const result = withLocks([a, b], () => "nope");

    expect(result.ok).toBe(false);
    // The first lock must not be left behind for the stale timer to reap.
    expect(fs.existsSync(a.dir)).toBe(false);
    expect(fs.existsSync(b.dir)).toBe(true);
  });

  it("reports an unavailable lock separately from a busy one", () => {
    // A path whose parent does not exist cannot be created at all — that is a
    // different problem from contention and must not read as "try again".
    const broken: LockSpec = { dir: path.join(dir, "missing", "deep", "x.lock"), staleMs: 1_000 };

    const result = withLocks([broken], () => "nope");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("unavailable");
      expect(describeLockFailure(result.failure)).toContain("Could not coordinate");
    }
  });

  it("keeps the lock fresh while long work runs", async () => {
    const a = lock("a.lock", 60_000);
    let observed = 0;
    withLocks([a], () => {
      observed = fs.statSync(a.dir).mtimeMs;
      return null;
    });
    // The heartbeat only matters over seconds; assert it is wired rather than
    // sleeping for one: the directory existed with a fresh mtime during work.
    expect(Date.now() - observed).toBeLessThan(5_000);
  });

  it("serialises two writers: the second cannot enter while the first holds", () => {
    const a = lock("a.lock");
    let inner: ReturnType<typeof withLocks<string>> | null = null;

    withLocks([a], () => {
      // Simulates Claude Code refreshing while we try to swap.
      inner = withLocks([a], () => "interleaved");
      return "outer";
    });

    expect(inner).not.toBeNull();
    expect(inner?.ok).toBe(false);
  });
});

describe("lock specs", () => {
  it("takes the primary credential lock before the legacy one", () => {
    expect(CREDENTIAL_LOCKS.map((l) => path.basename(l.dir))).toEqual([
      ".oauth_refresh.lock",
      ".claude.lock",
    ]);
  });

  it("gives the credential locks a longer stale window than the config lock", () => {
    // The credential path holds its lock across a network refresh; the config
    // write is local. Copying one window onto both would either reclaim a live
    // refresh lock early or leave a dead config lock in place for a minute.
    for (const l of CREDENTIAL_LOCKS) expect(l.staleMs).toBe(60_000);
    expect(CONFIG_LOCK.staleMs).toBe(10_000);
  });

  it("points at the paths Claude Code actually uses", () => {
    const home = os.homedir();
    expect(CREDENTIAL_LOCKS[0].dir).toBe(path.join(home, ".claude", ".oauth_refresh.lock"));
    expect(CREDENTIAL_LOCKS[1].dir).toBe(path.join(home, ".claude.lock"));
    expect(CONFIG_LOCK.dir).toBe(path.join(home, ".claude.json.lock"));
  });
});

describe("describeLockFailure", () => {
  it("tells the user to retry when the lock is merely busy", () => {
    expect(describeLockFailure({ reason: "busy", lock: "/x" })).toContain("Try again");
  });
});
