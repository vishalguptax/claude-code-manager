import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * jsonlFallback walks `~/.claude/projects/<slug>/<sessionId>.jsonl`. We
 * mock the three fs APIs it touches (readdirSync, statSync,
 * readFileSync) with an in-memory virtual filesystem so each test can
 * declare exactly which lines exist for which session/day.
 */
type Vfs = {
  dirs: Record<string, string[]>;
  mtimes: Record<string, number>;
  files: Record<string, string>;
};

const vfs = vi.hoisted<Vfs>(() => ({
  dirs: {},
  mtimes: {},
  files: {},
}));

vi.mock("fs", () => ({
  readdirSync: (p: string): string[] => {
    const entry = vfs.dirs[p];
    if (!entry) {
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    }
    return entry;
  },
  statSync: (p: string): { mtimeMs: number } => {
    const m = vfs.mtimes[p];
    if (m === undefined) {
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    }
    return { mtimeMs: m };
  },
  readFileSync: (p: string): string => {
    const c = vfs.files[p];
    if (c === undefined) {
      const e = new Error("ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      throw e;
    }
    return c;
  },
}));

import { aggregateJsonlSince } from "../jsonlFallback";
import { __internals } from "../usage";
import { PROJECTS_DIR } from "../../../core/config";
import * as path from "path";

beforeEach(() => {
  vfs.dirs = {};
  vfs.mtimes = {};
  vfs.files = {};
});

/** Helper — build one assistant entry line with usage tokens. */
function assistantLine(opts: {
  ts: string;
  sessionId: string;
  model: string;
  input: number;
  output: number;
  tools?: number;
}): string {
  const content = [];
  for (let i = 0; i < (opts.tools ?? 0); i++) {
    content.push({ type: "tool_use", name: "Bash" });
  }
  return JSON.stringify({
    type: "assistant",
    timestamp: opts.ts,
    sessionId: opts.sessionId,
    message: {
      model: opts.model,
      usage: { input_tokens: opts.input, output_tokens: opts.output },
      content,
    },
  });
}

function userLine(opts: { ts: string; sessionId: string; sidechain?: boolean }): string {
  return JSON.stringify({
    type: "user",
    timestamp: opts.ts,
    sessionId: opts.sessionId,
    isSidechain: opts.sidechain ?? false,
  });
}

function setupSingleSession(
  slug: string,
  fileName: string,
  lines: string[],
  mtimeIso: string,
): void {
  const projDir = path.join(PROJECTS_DIR, slug);
  const filePath = path.join(projDir, fileName);
  vfs.dirs[PROJECTS_DIR] = [...(vfs.dirs[PROJECTS_DIR] ?? []), slug];
  vfs.dirs[projDir] = [fileName];
  vfs.mtimes[filePath] = Date.parse(mtimeIso);
  vfs.files[filePath] = lines.join("\n");
}

describe("aggregateJsonlSince", () => {
  it("returns [] when PROJECTS_DIR is missing", () => {
    expect(aggregateJsonlSince("2026-04-26")).toEqual([]);
  });

  it("aggregates per-day messageCount, sessionCount, tokensByModel from one session", () => {
    setupSingleSession(
      "proj-a",
      "sess1.jsonl",
      [
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" }),
        assistantLine({
          ts: "2026-04-26T10:00:05Z",
          sessionId: "s1",
          model: "claude-opus-4-7",
          input: 100,
          output: 200,
        }),
        userLine({ ts: "2026-04-26T11:00:00Z", sessionId: "s1" }),
      ],
      "2026-04-26T11:00:00Z",
    );
    const out = aggregateJsonlSince("2026-04-26");
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-04-26");
    expect(out[0].messageCount).toBe(2);
    expect(out[0].sessionCount).toBe(1);
    expect(out[0].tokensByModel["claude-opus-4-7"]).toBe(300);
    expect(out[0].inputByModel["claude-opus-4-7"]).toBe(100);
    expect(out[0].outputByModel["claude-opus-4-7"]).toBe(200);
  });

  it("counts unique sessionIds across multiple files on the same day", () => {
    const projDir = path.join(PROJECTS_DIR, "proj-a");
    const f1 = path.join(projDir, "s1.jsonl");
    const f2 = path.join(projDir, "s2.jsonl");
    vfs.dirs[PROJECTS_DIR] = ["proj-a"];
    vfs.dirs[projDir] = ["s1.jsonl", "s2.jsonl"];
    vfs.mtimes[f1] = Date.parse("2026-04-26T10:00:00Z");
    vfs.mtimes[f2] = Date.parse("2026-04-26T11:00:00Z");
    vfs.files[f1] = userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" });
    vfs.files[f2] = userLine({ ts: "2026-04-26T11:00:00Z", sessionId: "s2" });
    const out = aggregateJsonlSince("2026-04-26");
    expect(out[0].sessionCount).toBe(2);
  });

  it("ignores sidechain user lines (sub-agent activity is not user messages)", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" }),
        userLine({ ts: "2026-04-26T10:00:05Z", sessionId: "s1", sidechain: true }),
        userLine({ ts: "2026-04-26T10:00:10Z", sessionId: "s1" }),
      ],
      "2026-04-26T11:00:00Z",
    );
    expect(aggregateJsonlSince("2026-04-26")[0].messageCount).toBe(2);
  });

  it("counts tool_use blocks toward toolCallCount", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        assistantLine({
          ts: "2026-04-26T10:00:00Z",
          sessionId: "s1",
          model: "m",
          input: 1,
          output: 1,
          tools: 3,
        }),
        assistantLine({
          ts: "2026-04-26T10:01:00Z",
          sessionId: "s1",
          model: "m",
          input: 1,
          output: 1,
          tools: 2,
        }),
      ],
      "2026-04-26T11:00:00Z",
    );
    expect(aggregateJsonlSince("2026-04-26")[0].toolCallCount).toBe(5);
  });

  it("excludes lines older than the requested startDate", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        userLine({ ts: "2026-04-25T10:00:00Z", sessionId: "s1" }),
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" }),
      ],
      "2026-04-26T11:00:00Z",
    );
    const out = aggregateJsonlSince("2026-04-26");
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-04-26");
    expect(out[0].messageCount).toBe(1);
  });

  it("skips files whose mtime predates startDate (mtime gate)", () => {
    setupSingleSession(
      "proj-a",
      "old.jsonl",
      [userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s-touch-old" })],
      "2026-04-20T00:00:00Z",
    );
    expect(aggregateJsonlSince("2026-04-26")).toEqual([]);
  });

  it("survives malformed JSON lines", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        "{not json",
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" }),
        "",
      ],
      "2026-04-26T11:00:00Z",
    );
    expect(aggregateJsonlSince("2026-04-26")[0].messageCount).toBe(1);
  });

  it("gapStartDate returns the day after lastComputedDate", () => {
    expect(__internals.gapStartDate("2026-04-25")).toBe("2026-04-26");
    expect(__internals.gapStartDate("")).toBe("");
    expect(__internals.gapStartDate("not-a-date")).toBe("");
  });

  it("augmentWithJsonl folds gap rows into a stale cache projection", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "ssA" }),
        assistantLine({
          ts: "2026-04-26T10:00:05Z",
          sessionId: "ssA",
          model: "claude-opus-4-7",
          input: 1_000,
          output: 2_000,
        }),
        userLine({ ts: "2026-04-27T09:00:00Z", sessionId: "ssB" }),
        assistantLine({
          ts: "2026-04-27T09:00:05Z",
          sessionId: "ssB",
          model: "claude-sonnet-4-6",
          input: 500,
          output: 500,
        }),
      ],
      "2026-04-27T12:00:00Z",
    );
    const stale = __internals.projectCache({
      lastComputedDate: "2026-04-25",
      dailyActivity: [
        { date: "2026-04-25", messageCount: 10, sessionCount: 1, toolCallCount: 5 },
      ],
      dailyModelTokens: [
        { date: "2026-04-25", tokensByModel: { "claude-opus-4-7": 50_000 } },
      ],
      modelUsage: {
        "claude-opus-4-7": { inputTokens: 20_000, outputTokens: 30_000 },
      },
      totalSessions: 1,
      totalMessages: 10,
    });
    const augmented = __internals.augmentWithJsonl(stale);
    expect(augmented.daily.map((d) => d.date)).toEqual([
      "2026-04-25",
      "2026-04-26",
      "2026-04-27",
    ]);
    // Gap days appended; cached day untouched.
    expect(augmented.daily.find((d) => d.date === "2026-04-25")?.messageCount).toBe(10);
    expect(augmented.daily.find((d) => d.date === "2026-04-26")?.messageCount).toBe(1);
    expect(augmented.dailyTokens.find((d) => d.date === "2026-04-26")?.total).toBe(3_000);
    // lastComputedDate advances so the heatmap stops marking these
    // dates as stale.
    expect(augmented.lastComputedDate).toBe("2026-04-27");
    // byModel folds in the new sonnet model and bumps opus totals.
    const opus = augmented.byModel.find((m) => m.model === "claude-opus-4-7");
    const sonnet = augmented.byModel.find((m) => m.model === "claude-sonnet-4-6");
    expect(opus?.inputTokens).toBe(21_000);
    expect(opus?.outputTokens).toBe(32_000);
    expect(sonnet?.inputTokens).toBe(500);
    expect(sonnet?.outputTokens).toBe(500);
    expect(augmented.totalTokens).toBe(54_000);
    // Sessions / messages additive.
    expect(augmented.totalSessions).toBe(1 + 2);
    expect(augmented.totalMessages).toBe(10 + 2);
  });

  it("augmentWithJsonl is a no-op when the gap window has no JSONL activity", () => {
    const projected = __internals.projectCache({
      lastComputedDate: "2026-04-25",
      dailyActivity: [
        { date: "2026-04-25", messageCount: 1, sessionCount: 1, toolCallCount: 0 },
      ],
    });
    const augmented = __internals.augmentWithJsonl(projected);
    expect(augmented.daily).toHaveLength(1);
    expect(augmented.lastComputedDate).toBe("2026-04-25");
  });

  it("returns days sorted by date ascending", () => {
    setupSingleSession(
      "proj-a",
      "s.jsonl",
      [
        userLine({ ts: "2026-04-28T10:00:00Z", sessionId: "s1" }),
        userLine({ ts: "2026-04-26T10:00:00Z", sessionId: "s1" }),
        userLine({ ts: "2026-04-27T10:00:00Z", sessionId: "s1" }),
      ],
      "2026-04-28T11:00:00Z",
    );
    const dates = aggregateJsonlSince("2026-04-26").map((d) => d.date);
    expect(dates).toEqual(["2026-04-26", "2026-04-27", "2026-04-28"]);
  });
});
