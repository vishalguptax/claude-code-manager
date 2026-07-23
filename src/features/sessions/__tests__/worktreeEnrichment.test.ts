import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorktreeRef } from "../../../extension/worktrees";

// Mock the extension-host worktree resolver so these tests exercise the
// mapping/fan-out logic without spawning git.
const resolveWorktrees = vi.fn();
vi.mock("../../../extension/worktrees", () => ({
  resolveWorktrees: (...args: unknown[]) => resolveWorktrees(...args),
}));

import { buildWorktreeMap, postWorktrees } from "../worktreeEnrichment";
import type { Session } from "../types";

function makeSession(id: string, projectPath: string): Session {
  return {
    id,
    name: "",
    project: "p",
    projectPath,
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: "p",
    searchHaystack: "",
  };
}

function ref(path: string): WorktreeRef {
  return {
    path,
    branch: "worktree-x",
    kind: "claude",
    exists: true,
    locked: false,
    repoRoot: "/repo",
  };
}

beforeEach(() => {
  resolveWorktrees.mockReset();
});

describe("buildWorktreeMap", () => {
  it("fans a resolved directory out to every session id sharing it", () => {
    const wt = ref("/repo/.claude/worktrees/x");
    resolveWorktrees.mockReturnValue(new Map([["/repo/.claude/worktrees/x", wt]]));

    const sessions = [
      makeSession("a", "/repo/.claude/worktrees/x"),
      makeSession("b", "/repo/.claude/worktrees/x"),
    ];
    const map = buildWorktreeMap(sessions);

    expect(map).toEqual({ a: wt, b: wt });
  });

  it("omits sessions whose directory did not resolve", () => {
    resolveWorktrees.mockReturnValue(
      new Map([["/repo/wt", ref("/repo/wt")]]),
    );
    const sessions = [
      makeSession("in", "/repo/wt"),
      makeSession("out", "/not/a/repo"),
    ];
    const map = buildWorktreeMap(sessions);
    expect(Object.keys(map)).toEqual(["in"]);
  });

  it("passes only non-empty projectPaths to the resolver", () => {
    resolveWorktrees.mockReturnValue(new Map());
    buildWorktreeMap([makeSession("a", "/repo/wt"), makeSession("b", "")]);
    expect(resolveWorktrees).toHaveBeenCalledWith(["/repo/wt"]);
  });

  it("returns an empty map when nothing resolves", () => {
    resolveWorktrees.mockReturnValue(new Map());
    expect(buildWorktreeMap([makeSession("a", "/repo/wt")])).toEqual({});
  });
});

describe("postWorktrees", () => {
  const flush = () => new Promise((r) => setImmediate(r));

  it("posts a worktrees message after the current tick", async () => {
    const wt = ref("/repo/wt");
    resolveWorktrees.mockReturnValue(new Map([["/repo/wt", wt]]));
    const post = vi.fn();
    const wv = { postMessage: post } as never;

    postWorktrees(wv, [makeSession("a", "/repo/wt")]);
    // Deferred — nothing posted synchronously so the sessions list paints first.
    expect(post).not.toHaveBeenCalled();

    await flush();
    expect(post).toHaveBeenCalledWith({ type: "worktrees", map: { a: wt } });
  });

  it("skips the message entirely when nothing resolves", async () => {
    resolveWorktrees.mockReturnValue(new Map());
    const post = vi.fn();
    postWorktrees({ postMessage: post } as never, [makeSession("a", "/repo/wt")]);
    await flush();
    expect(post).not.toHaveBeenCalled();
  });
});
