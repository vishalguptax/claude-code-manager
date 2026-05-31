import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * projectStats walks every JSONL under PROJECTS_DIR and aggregates
 * per-project / per-tool / per-MCP-server totals. We mock the same
 * three fs APIs the aggregator touches (readdirSync, statSync,
 * readFileSync) with an in-memory vfs.
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

import {
  aggregateProjectStats,
  aggregateUsage,
  resetProjectStatsCache,
} from "../projectStats";
import { PROJECTS_DIR } from "../../../core/config";
import * as path from "path";

beforeEach(() => {
  vfs.dirs = {};
  vfs.mtimes = {};
  vfs.files = {};
  uuidCounter = 0;
  delete process.env.CLAUDE_CONFIG_DIRS;
  resetProjectStatsCache();
});

function setupProject(slug: string, file: string, lines: string[], mtime = 1000): void {
  const projDir = path.join(PROJECTS_DIR, slug);
  const filePath = path.join(projDir, file);
  vfs.dirs[PROJECTS_DIR] = [...(vfs.dirs[PROJECTS_DIR] ?? []), slug];
  vfs.dirs[projDir] = [...(vfs.dirs[projDir] ?? []), file];
  vfs.mtimes[projDir] = mtime;
  vfs.mtimes[filePath] = mtime;
  vfs.files[filePath] = lines.join("\n");
}

let uuidCounter = 0;
function nextUuid(): string {
  uuidCounter++;
  return `uuid-${uuidCounter}`;
}

function assistantLine(opts: {
  ts?: string;
  sessionId: string;
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreation?: number;
  tools?: string[];
  cwd?: string;
  uuid?: string;
  messageId?: string;
}): string {
  const content = (opts.tools ?? []).map((name) => ({ type: "tool_use", name }));
  return JSON.stringify({
    type: "assistant",
    uuid: opts.uuid ?? nextUuid(),
    timestamp: opts.ts ?? "2026-04-26T10:00:00Z",
    sessionId: opts.sessionId,
    cwd: opts.cwd,
    message: {
      id: opts.messageId ?? `msg-${opts.uuid ?? nextUuid()}`,
      model: opts.model ?? "claude-opus-4-7",
      usage: {
        input_tokens: opts.input ?? 0,
        output_tokens: opts.output ?? 0,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: opts.cacheCreation ?? 0,
      },
      content,
    },
  });
}

function userLine(
  sessionId: string,
  ts = "2026-04-26T09:00:00Z",
  cwd?: string,
  uuid?: string,
): string {
  return JSON.stringify({
    type: "user",
    uuid: uuid ?? nextUuid(),
    timestamp: ts,
    sessionId,
    cwd,
  });
}

describe("aggregateProjectStats", () => {
  it("returns empty breakdown when PROJECTS_DIR is missing", () => {
    const out = aggregateProjectStats();
    expect(out.byProject).toEqual([]);
    expect(out.byTool).toEqual([]);
    expect(out.byMcpServer).toEqual([]);
  });

  it("aggregates per-project tokens, sessions and messages", () => {
    setupProject("proj-a", "s.jsonl", [
      userLine("s1", "2026-04-26T10:00:00Z", "C:/a"),
      assistantLine({ sessionId: "s1", cwd: "C:/a", input: 100, output: 200 }),
      userLine("s2", "2026-04-26T11:00:00Z", "C:/a"),
    ]);
    setupProject("proj-b", "t.jsonl", [
      userLine("s3", "2026-04-26T12:00:00Z", "D:/b"),
      assistantLine({ sessionId: "s3", cwd: "D:/b", input: 10, output: 90 }),
    ]);

    const out = aggregateProjectStats();
    expect(out.byProject).toHaveLength(2);
    const a = out.byProject.find((p) => p.slug === "proj-a")!;
    expect(a.path).toBe("C:/a");
    expect(a.sessions).toBe(2);
    expect(a.messages).toBe(2);
    expect(a.tokens).toBe(300);
    // Opus rates: 100 input @ $15/M + 200 output @ $75/M = 0.0165
    expect(a.costUsd).toBeCloseTo((100 * 15 + 200 * 75) / 1_000_000);
    expect(a.lastActiveDate).toBe("2026-04-26");
  });

  it("sorts projects by total tokens descending", () => {
    setupProject("small", "s.jsonl", [
      assistantLine({ sessionId: "x", input: 1, output: 1 }),
    ]);
    setupProject("big", "b.jsonl", [
      assistantLine({ sessionId: "y", input: 1000, output: 1000 }),
    ]);
    const out = aggregateProjectStats();
    expect(out.byProject.map((p) => p.slug)).toEqual(["big", "small"]);
  });

  it("falls back to slug when no entry exposes cwd", () => {
    setupProject("slug-only", "s.jsonl", [
      userLine("s1"),
      assistantLine({ sessionId: "s1", input: 5, output: 5 }),
    ]);
    const out = aggregateProjectStats();
    expect(out.byProject[0].path).toBe("slug-only");
  });

  it("counts tool invocations and ranks by frequency", () => {
    setupProject("p", "s.jsonl", [
      assistantLine({ sessionId: "s1", tools: ["Read", "Read", "Edit"] }),
      assistantLine({ sessionId: "s1", tools: ["Read", "Bash"] }),
    ]);
    const out = aggregateProjectStats();
    expect(out.byTool[0]).toEqual({ name: "Read", count: 3 });
    expect(out.byTool[1].count).toBe(1);
    expect(out.byTool).toHaveLength(3);
  });

  it("extracts MCP server usage from mcp__server__tool names", () => {
    setupProject("p", "s.jsonl", [
      assistantLine({
        sessionId: "s1",
        tools: [
          "mcp__github__create_issue",
          "mcp__github__create_issue",
          "mcp__github__list_repos",
          "mcp__linear__find_issue",
          "Read",
        ],
      }),
    ]);
    const out = aggregateProjectStats();
    const gh = out.byMcpServer.find((s) => s.server === "github")!;
    expect(gh.toolCount).toBe(3);
    expect(gh.uniqueTools).toBe(2);
    const linear = out.byMcpServer.find((s) => s.server === "linear")!;
    expect(linear.toolCount).toBe(1);
    expect(linear.uniqueTools).toBe(1);
    // Sorted by toolCount desc
    expect(out.byMcpServer[0].server).toBe("github");
  });

  it("ignores built-in tools when computing MCP servers", () => {
    setupProject("p", "s.jsonl", [
      assistantLine({ sessionId: "s1", tools: ["Read", "Edit", "Bash"] }),
    ]);
    const out = aggregateProjectStats();
    expect(out.byMcpServer).toEqual([]);
    expect(out.byTool).toHaveLength(3);
  });

  it("survives malformed lines without crashing", () => {
    setupProject("p", "s.jsonl", [
      "{not json",
      "",
      userLine("s1"),
      assistantLine({ sessionId: "s1", input: 50, output: 50 }),
    ]);
    const out = aggregateProjectStats();
    expect(out.byProject[0].tokens).toBe(100);
  });

  it("memoises by fingerprint — same dir mtimes returns cached result", () => {
    setupProject("p", "s.jsonl", [
      assistantLine({ sessionId: "s1", input: 1, output: 1 }),
    ]);
    const first = aggregateProjectStats();
    // Mutate the underlying file content but DON'T touch the mtime —
    // memo must hold the previous result.
    vfs.files[path.join(PROJECTS_DIR, "p", "s.jsonl")] = "";
    const second = aggregateProjectStats();
    expect(second).toBe(first);
  });

  it("recomputes when project-dir mtime changes", () => {
    setupProject("p", "s.jsonl", [
      assistantLine({ sessionId: "s1", input: 1, output: 1 }),
    ], 1000);
    aggregateProjectStats();
    // Simulate a new session being written: bump mtime + change content.
    vfs.mtimes[path.join(PROJECTS_DIR, "p")] = 2000;
    vfs.files[path.join(PROJECTS_DIR, "p", "s.jsonl")] = JSON.stringify({
      type: "assistant",
      timestamp: "2026-04-27T10:00:00Z",
      sessionId: "s2",
      message: { model: "claude-opus-4-7", usage: { input_tokens: 99, output_tokens: 99 } },
    });
    const out = aggregateProjectStats();
    expect(out.byProject[0].tokens).toBe(198);
  });

  it("excludes projects with no sessions and zero tokens", () => {
    // Empty file under a project slug — directory exists but no entries.
    const projDir = path.join(PROJECTS_DIR, "empty");
    vfs.dirs[PROJECTS_DIR] = ["empty"];
    vfs.dirs[projDir] = ["s.jsonl"];
    vfs.mtimes[projDir] = 1;
    vfs.mtimes[path.join(projDir, "s.jsonl")] = 1;
    vfs.files[path.join(projDir, "s.jsonl")] = "";
    const out = aggregateProjectStats();
    expect(out.byProject).toEqual([]);
  });
});

describe("aggregateUsage — totals + daily", () => {
  it("rolls up daily activity and tokens across all projects", () => {
    setupProject("a", "s.jsonl", [
      userLine("s1", "2026-05-10T09:00:00Z"),
      assistantLine({
        sessionId: "s1",
        ts: "2026-05-10T09:00:05Z",
        input: 100,
        output: 200,
      }),
    ]);
    setupProject("b", "t.jsonl", [
      userLine("s2", "2026-05-10T10:00:00Z"),
      userLine("s2", "2026-05-11T11:00:00Z"),
      assistantLine({
        sessionId: "s2",
        ts: "2026-05-11T11:00:05Z",
        input: 50,
        output: 50,
      }),
    ]);
    const out = aggregateUsage();
    expect(out.daily.map((d) => d.date)).toEqual(["2026-05-10", "2026-05-11"]);
    expect(out.daily[0].sessionCount).toBe(2); // s1 + s2
    expect(out.daily[1].sessionCount).toBe(1); // only s2
    expect(out.dailyTokens.find((d) => d.date === "2026-05-10")?.total).toBe(300);
    expect(out.dailyTokens.find((d) => d.date === "2026-05-11")?.total).toBe(100);
  });

  it("totals tokens, sessions, messages across all projects", () => {
    setupProject("a", "s.jsonl", [
      userLine("s1", "2026-05-10T09:00:00Z"),
      assistantLine({
        sessionId: "s1",
        ts: "2026-05-10T09:00:05Z",
        input: 100,
        output: 200,
        cacheRead: 50,
      }),
    ]);
    setupProject("b", "t.jsonl", [
      userLine("s2", "2026-05-10T10:00:00Z"),
      assistantLine({
        sessionId: "s2",
        ts: "2026-05-10T10:00:05Z",
        input: 10,
        output: 90,
        cacheCreation: 20,
      }),
    ]);
    const out = aggregateUsage();
    expect(out.totalSessions).toBe(2);
    expect(out.totalMessages).toBe(2);
    expect(out.totalInputTokens).toBe(110);
    expect(out.totalOutputTokens).toBe(290);
    expect(out.totalTokens).toBe(400);
    expect(out.totalCacheReadTokens).toBe(50);
    expect(out.totalCacheCreationTokens).toBe(20);
    expect(out.firstSessionDate).toBe("2026-05-10");
  });

  it("computes longestSessionMs from per-session timestamps", () => {
    setupProject("a", "s.jsonl", [
      userLine("s1", "2026-05-10T09:00:00Z"),
      assistantLine({ sessionId: "s1", ts: "2026-05-10T10:30:00Z", input: 1, output: 1 }),
      userLine("s2", "2026-05-10T12:00:00Z"),
      assistantLine({ sessionId: "s2", ts: "2026-05-10T12:05:00Z", input: 1, output: 1 }),
    ]);
    const out = aggregateUsage();
    // s1 ran 90 minutes, s2 ran 5 minutes — longest = 5400000 ms.
    expect(out.longestSessionMs).toBe(90 * 60 * 1000);
  });

  it("byModel rolls up across all projects", () => {
    setupProject("a", "s.jsonl", [
      assistantLine({ sessionId: "s1", model: "claude-opus-4-7", input: 100, output: 200 }),
    ]);
    setupProject("b", "t.jsonl", [
      assistantLine({ sessionId: "s2", model: "claude-opus-4-7", input: 50, output: 50 }),
      assistantLine({ sessionId: "s2", model: "claude-sonnet-4-6", input: 200, output: 300 }),
    ]);
    const out = aggregateUsage();
    const opus = out.byModel.find((m) => m.model === "claude-opus-4-7")!;
    const sonnet = out.byModel.find((m) => m.model === "claude-sonnet-4-6")!;
    expect(opus.inputTokens).toBe(150);
    expect(opus.outputTokens).toBe(250);
    expect(sonnet.totalTokens).toBe(500);
    // Sorted by model recency desc (opus 4-7 > sonnet 4-6).
    expect(out.byModel[0].model).toBe("claude-opus-4-7");
    expect(out.byModel[1].model).toBe("claude-sonnet-4-6");
  });
});

describe("aggregateUsage — dedup", () => {
  it("dedups duplicate uuids across files (resumed transcript)", () => {
    // Same uuid appears in two files — happens when Claude resumes a
    // session and re-appends earlier turns to a new transcript file.
    const sharedAssistant = assistantLine({
      sessionId: "s1",
      uuid: "dup-uuid",
      input: 100,
      output: 200,
    });
    setupProject("a", "first.jsonl", [
      userLine("s1", "2026-05-10T09:00:00Z", undefined, "u-1"),
      sharedAssistant,
    ]);
    // Second file in the same slug carries the same assistant uuid.
    const projDir = path.join(PROJECTS_DIR, "a");
    vfs.dirs[projDir] = ["first.jsonl", "second.jsonl"];
    vfs.mtimes[path.join(projDir, "second.jsonl")] = 1000;
    vfs.files[path.join(projDir, "second.jsonl")] = [
      userLine("s1", "2026-05-10T09:00:00Z", undefined, "u-1"),
      sharedAssistant,
    ].join("\n");
    const out = aggregateUsage();
    // Tokens counted once despite two appearances.
    expect(out.totalInputTokens).toBe(100);
    expect(out.totalOutputTokens).toBe(200);
    expect(out.totalMessages).toBe(1);
  });

  it("dedups assistants by message.id when uuid is absent", () => {
    // Two files, two different uuids, SAME message.id.
    const a = JSON.stringify({
      type: "assistant",
      timestamp: "2026-05-10T09:00:00Z",
      sessionId: "s1",
      message: {
        id: "msg-same",
        model: "claude-opus-4-7",
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [],
      },
    });
    const b = JSON.stringify({
      type: "assistant",
      timestamp: "2026-05-10T09:00:00Z",
      sessionId: "s1",
      message: {
        id: "msg-same",
        model: "claude-opus-4-7",
        usage: { input_tokens: 10, output_tokens: 20 },
        content: [],
      },
    });
    setupProject("a", "f1.jsonl", [a]);
    const projDir = path.join(PROJECTS_DIR, "a");
    vfs.dirs[projDir] = ["f1.jsonl", "f2.jsonl"];
    vfs.mtimes[path.join(projDir, "f2.jsonl")] = 1000;
    vfs.files[path.join(projDir, "f2.jsonl")] = b;
    const out = aggregateUsage();
    expect(out.totalTokens).toBe(30); // counted once
  });
});

describe("aggregateUsage — CLAUDE_CONFIG_DIRS", () => {
  it("merges JSONL from every dir listed in CLAUDE_CONFIG_DIRS", () => {
    setupProject("a", "s.jsonl", [
      assistantLine({ sessionId: "s1", input: 100, output: 200 }),
    ]);
    // Set up a second config dir with its own projects/. Avoid a drive
    // letter — on POSIX, `path.delimiter` is `:`, so `C:/...` would be
    // split into two bogus entries when CLAUDE_CONFIG_DIRS is parsed.
    const altRoot = process.platform === "win32" ? "C:\\alt-claude" : "/alt-claude";
    const altProjects = path.join(altRoot, "projects");
    const altSlug = path.join(altProjects, "z");
    vfs.dirs[altProjects] = ["z"];
    vfs.dirs[altSlug] = ["s.jsonl"];
    vfs.mtimes[altSlug] = 2000;
    vfs.mtimes[path.join(altSlug, "s.jsonl")] = 2000;
    vfs.files[path.join(altSlug, "s.jsonl")] = assistantLine({
      sessionId: "alt-s1",
      input: 50,
      output: 50,
    });
    process.env.CLAUDE_CONFIG_DIRS = altRoot;
    resetProjectStatsCache();
    const out = aggregateUsage();
    expect(out.totalSessions).toBe(2);
    expect(out.totalTokens).toBe(400);
    expect(out.byProject.map((p) => p.slug).sort()).toEqual(["a", "z"]);
  });
});
