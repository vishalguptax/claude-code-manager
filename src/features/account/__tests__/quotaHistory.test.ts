import { describe, it, expect, beforeEach, vi } from "vitest";
import type { QuotaResult } from "../quota";

/**
 * quotaHistory reads and atomically writes QUOTA_HISTORY_FILE and asks
 * profiles.ts who is signed in. Both are faked: an in-memory vfs so the
 * newer-capture guard and eviction can be asserted without disk, and a
 * settable identity so "the account changed between reads" is reachable.
 */
const vfs = vi.hoisted(() => ({ files: {} as Record<string, string>, writes: 0 }));
const identity = vi.hoisted(() => ({ uuid: "acct-a" }));

vi.mock("fs", () => {
  const enoent = (): never => {
    const e = new Error("ENOENT") as NodeJS.ErrnoException;
    e.code = "ENOENT";
    throw e;
  };
  return {
    readFileSync: (p: string): string => vfs.files[p] ?? enoent(),
    writeFileSync: (p: string, data: string): void => {
      vfs.files[p] = data;
    },
    renameSync: (from: string, to: string): void => {
      const data = vfs.files[from];
      if (data === undefined) enoent();
      delete vfs.files[from];
      vfs.files[to] = data;
      vfs.writes++;
    },
    unlinkSync: (p: string): void => {
      delete vfs.files[p];
    },
    mkdirSync: (): void => {
      /* vfs has no directories */
    },
  };
});

vi.mock("../profiles", () => ({
  readLiveAccountUuid: (): string => identity.uuid,
}));

import { readProfileQuota, readQuotaHistory, rememberActiveQuota } from "../quotaHistory";
import { QUOTA_HISTORY_FILE } from "../../../core/config";

const HOUR = 60 * 60_000;

/** A successful quota read captured at `capturedAt`. */
function reading(capturedAt: string, sevenDay = 62, fiveHour = 15): QuotaResult {
  const capturedMs = Date.parse(capturedAt);
  const resetsAt = Number.isNaN(capturedMs)
    ? ""
    : new Date(capturedMs + 3 * 24 * HOUR).toISOString();
  return {
    ok: true,
    data: {
      quota: {
        fiveHour: { utilization: fiveHour, resetsAt: "" },
        sevenDay: { utilization: sevenDay, resetsAt },
        capturedAt,
        fetchedAt: capturedAt,
      },
      live: {
        model: "Opus 5",
        contextUsedPercent: null,
        contextSize: null,
        sessionCostUsd: null,
        linesAdded: null,
        linesRemoved: null,
        version: "2.1.86",
        capturedAt,
        promptCache: null,
      },
    },
  };
}

beforeEach(() => {
  vfs.files = {};
  vfs.writes = 0;
  identity.uuid = "acct-a";
});

describe("rememberActiveQuota", () => {
  it("files a reading under the account that was live", () => {
    rememberActiveQuota(reading("2026-09-14T10:00:00.000Z"));
    expect(readProfileQuota("acct-a")).toMatchObject({
      sevenDayPercent: 62,
      fiveHourPercent: 15,
      capturedAt: "2026-09-14T10:00:00.000Z",
    });
  });

  it("keeps each account's figures apart", () => {
    rememberActiveQuota(reading("2026-09-14T10:00:00.000Z", 62));
    identity.uuid = "acct-b";
    rememberActiveQuota(reading("2026-09-14T11:00:00.000Z", 9));

    expect(readProfileQuota("acct-a")?.sevenDayPercent).toBe(62);
    expect(readProfileQuota("acct-b")?.sevenDayPercent).toBe(9);
  });

  it("does not rewrite the file when the render has not changed", () => {
    // The cache watcher fires on any touch, not only a real render. A
    // rewrite per touch would be pure disk churn during an active session.
    rememberActiveQuota(reading("2026-09-14T10:00:00.000Z"));
    const after = vfs.writes;
    rememberActiveQuota(reading("2026-09-14T10:00:00.000Z"));
    expect(vfs.writes).toBe(after);
  });

  it("never lets an older reading overwrite a newer one", () => {
    // After a switch the global cache can still hold the previous
    // account's render; re-reading it must not roll this account back.
    rememberActiveQuota(reading("2026-09-14T12:00:00.000Z", 80));
    rememberActiveQuota(reading("2026-09-14T09:00:00.000Z", 20));
    expect(readProfileQuota("acct-a")?.sevenDayPercent).toBe(80);
  });

  it("ignores a failed read", () => {
    rememberActiveQuota({ ok: false, error: { kind: "no-data", message: "none" } });
    expect(readQuotaHistory()).toBeNull();
  });

  it("ignores a reading it cannot place in time", () => {
    rememberActiveQuota(reading(""));
    expect(readQuotaHistory()).toBeNull();
  });

  it("ignores a reading when nobody is signed in", () => {
    identity.uuid = "";
    rememberActiveQuota(reading("2026-09-14T10:00:00.000Z"));
    expect(readQuotaHistory()).toBeNull();
  });

  it("evicts the oldest account once the file is full", () => {
    for (let i = 0; i < 21; i++) {
      identity.uuid = `acct-${i}`;
      // Ascending captures: acct-0 is the oldest and goes first.
      rememberActiveQuota(reading(new Date(Date.UTC(2026, 8, 1, i)).toISOString()));
    }
    const accounts = readQuotaHistory()?.accounts ?? {};
    expect(Object.keys(accounts)).toHaveLength(20);
    expect(accounts["acct-0"]).toBeUndefined();
    expect(accounts["acct-20"]).toBeDefined();
  });

  it("survives an unwritable file without throwing", () => {
    // A read-only home must not break the switch the user is mid-way through.
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() => rememberActiveQuota(reading("2026-09-14T10:00:00.000Z"))).not.toThrow();
    spy.mockRestore();
  });
});

describe("readQuotaHistory", () => {
  it("rejects a file from a version it does not understand", () => {
    vfs.files[QUOTA_HISTORY_FILE] = JSON.stringify({ version: 99, accounts: { x: {} } });
    expect(readQuotaHistory()).toBeNull();
  });

  it("rejects unparseable content rather than throwing", () => {
    vfs.files[QUOTA_HISTORY_FILE] = "{ not json";
    expect(readQuotaHistory()).toBeNull();
  });

  it("has nothing to say about an account it has never seen", () => {
    expect(readProfileQuota("stranger")).toBeNull();
    expect(readProfileQuota("")).toBeNull();
  });
});
