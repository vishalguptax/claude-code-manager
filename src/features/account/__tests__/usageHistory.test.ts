import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * usageHistory reads and atomically writes USAGE_HISTORY_FILE. An
 * in-memory vfs backs readFileSync / writeFileSync / renameSync so the
 * max-merge and skip-unchanged behaviour can be asserted without disk.
 */
const vfs = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  writes: 0,
}));

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

import { readUsageHistory, recordUsageHistory } from "../usageHistory";
import { USAGE_HISTORY_FILE } from "../../../core/config";
import type { UsageAggregate } from "../projectStats";

function emptyAggregate(): UsageAggregate {
  return {
    daily: [],
    dailyTokens: [],
    dailyByModel: [],
    byModel: [],
    byProject: [],
    byTool: [],
    byMcpServer: [],
    totalSessions: 0,
    totalMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreationTokens: 0,
    totalCostUsd: 0,
    longestSessionMs: 0,
    firstSessionDate: "",
  };
}

function aggWithDay(
  date: string,
  opts: { messages?: number; sessions?: number; input?: number; output?: number } = {},
): UsageAggregate {
  const agg = emptyAggregate();
  agg.daily = [
    {
      date,
      messageCount: opts.messages ?? 1,
      sessionCount: opts.sessions ?? 1,
      toolCallCount: 0,
    },
  ];
  agg.dailyByModel = [
    {
      date,
      byModel: {
        "claude-opus-4-8": {
          input: opts.input ?? 100,
          output: opts.output ?? 50,
          cacheRead: 0,
          cacheCreation: 0,
        },
      },
    },
  ];
  return agg;
}

beforeEach(() => {
  vfs.files = {};
  vfs.writes = 0;
});

describe("readUsageHistory", () => {
  it("returns null when the file is missing", () => {
    expect(readUsageHistory()).toBeNull();
  });

  it("returns null on malformed JSON or wrong version", () => {
    vfs.files[USAGE_HISTORY_FILE] = "{not json";
    expect(readUsageHistory()).toBeNull();
    vfs.files[USAGE_HISTORY_FILE] = JSON.stringify({ version: 2, days: {} });
    expect(readUsageHistory()).toBeNull();
    vfs.files[USAGE_HISTORY_FILE] = JSON.stringify({ days: {} });
    expect(readUsageHistory()).toBeNull();
  });
});

describe("recordUsageHistory", () => {
  it("creates the rollup from an aggregate pass", () => {
    recordUsageHistory(aggWithDay("2026-07-01", { messages: 3, input: 100, output: 50 }));
    const h = readUsageHistory()!;
    expect(h.days["2026-07-01"]).toMatchObject({
      messages: 3,
      sessions: 1,
      byModel: { "claude-opus-4-8": { input: 100, output: 50 } },
    });
  });

  it("merges element-wise max — a shrunk aggregate (post-purge) never lowers a day", () => {
    recordUsageHistory(aggWithDay("2026-07-01", { messages: 5, input: 500 }));
    // Same day re-observed smaller (transcripts partially purged).
    recordUsageHistory(aggWithDay("2026-07-01", { messages: 2, input: 100 }));
    const h = readUsageHistory()!;
    expect(h.days["2026-07-01"].messages).toBe(5);
    expect(h.days["2026-07-01"].byModel["claude-opus-4-8"].input).toBe(500);
  });

  it("grows a day when the aggregate grows (live session appending)", () => {
    recordUsageHistory(aggWithDay("2026-07-01", { input: 100 }));
    recordUsageHistory(aggWithDay("2026-07-01", { input: 250 }));
    const h = readUsageHistory()!;
    expect(h.days["2026-07-01"].byModel["claude-opus-4-8"].input).toBe(250);
  });

  it("keeps days the new aggregate no longer contains", () => {
    recordUsageHistory(aggWithDay("2026-06-01", { input: 100 }));
    recordUsageHistory(aggWithDay("2026-07-01", { input: 200 }));
    const h = readUsageHistory()!;
    expect(Object.keys(h.days).sort()).toEqual(["2026-06-01", "2026-07-01"]);
  });

  it("skips the write when nothing grew", () => {
    recordUsageHistory(aggWithDay("2026-07-01"));
    const writesAfterFirst = vfs.writes;
    recordUsageHistory(aggWithDay("2026-07-01"));
    expect(vfs.writes).toBe(writesAfterFirst);
  });

  it("ignores an empty aggregate entirely", () => {
    recordUsageHistory(emptyAggregate());
    expect(vfs.writes).toBe(0);
    expect(readUsageHistory()).toBeNull();
  });

  it("recovers from a corrupt history file by starting fresh", () => {
    vfs.files[USAGE_HISTORY_FILE] = "{corrupt";
    recordUsageHistory(aggWithDay("2026-07-01", { input: 42 }));
    const h = readUsageHistory()!;
    expect(h.days["2026-07-01"].byModel["claude-opus-4-8"].input).toBe(42);
  });
});
