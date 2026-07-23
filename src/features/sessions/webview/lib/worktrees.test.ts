import { describe, expect, it } from "vitest";
import type { Session, WorktreeRef } from "../../types";
import {
  buildWorktreeOptions,
  currentRepoRoot,
  hasWorktrees,
  isSameRepo,
  matchesWorktreeFilter,
  pathTail,
  projectGroupValue,
  type WorktreeMap,
} from "./worktrees";

function session(over: Partial<Session> & { id: string }): Session {
  const base: Session = {
    id: over.id,
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 1000,
    endTime: 1000,
    messageCount: 1,
    summary: "summary",
    prompts: ["first prompt"],
    projectKey: "proj",
    searchHaystack: "",
  };
  return { ...base, ...over };
}

function ref(over: Partial<WorktreeRef> = {}): WorktreeRef {
  return {
    path: "/repo/.claude/worktrees/feat",
    branch: "worktree-feat",
    kind: "claude",
    exists: true,
    locked: false,
    repoRoot: "/repo",
    ...over,
  };
}

const NONE = new Set<string>();

describe("pathTail", () => {
  it("returns the last segment, tolerating trailing slashes and back-slashes", () => {
    expect(pathTail("/a/b/c")).toBe("c");
    expect(pathTail("/a/b/c/")).toBe("c");
    expect(pathTail("C:\\repo\\feat")).toBe("feat");
    expect(pathTail("")).toBe("");
  });
});

describe("currentRepoRoot", () => {
  it("returns the repoRoot of the worktree matching the workspace path", () => {
    const wt: WorktreeMap = { a: ref({ path: "/repo/feat", repoRoot: "/repo" }) };
    expect(currentRepoRoot(wt, "/repo/feat")).toBe("/repo");
    expect(currentRepoRoot(wt, "/repo/feat/")).toBe("/repo");
  });

  it("returns null when nothing matches or the workspace path is empty", () => {
    const wt: WorktreeMap = { a: ref({ path: "/repo/feat" }) };
    expect(currentRepoRoot(wt, "/elsewhere")).toBeNull();
    expect(currentRepoRoot(wt, "")).toBeNull();
    expect(currentRepoRoot({}, "/repo/feat")).toBeNull();
  });
});

describe("isSameRepo", () => {
  it("is true only for sessions whose ref shares the repoRoot", () => {
    const wt: WorktreeMap = {
      a: ref({ repoRoot: "/repo" }),
      b: ref({ repoRoot: "/other" }),
    };
    expect(isSameRepo(session({ id: "a" }), wt, "/repo")).toBe(true);
    expect(isSameRepo(session({ id: "b" }), wt, "/repo")).toBe(false);
    expect(isSameRepo(session({ id: "c" }), wt, "/repo")).toBe(false);
    expect(isSameRepo(session({ id: "a" }), wt, null)).toBe(false);
  });
});

describe("projectGroupValue", () => {
  it("uses repoRoot for worktree sessions and the project name otherwise", () => {
    const wt: WorktreeMap = { a: ref({ repoRoot: "/repo" }) };
    expect(projectGroupValue(session({ id: "a" }), wt)).toBe("/repo");
    expect(projectGroupValue(session({ id: "b", project: "plain" }), wt)).toBe("plain");
  });
});

describe("matchesWorktreeFilter", () => {
  const wt: WorktreeMap = {
    m: ref({ kind: "main" }),
    c: ref({ kind: "claude" }),
    u: ref({ kind: "user" }),
  };
  it("passes everything under 'all'", () => {
    expect(matchesWorktreeFilter(session({ id: "x" }), wt, "all")).toBe(true);
  });
  it("narrows by ref kind", () => {
    expect(matchesWorktreeFilter(session({ id: "c" }), wt, "claude")).toBe(true);
    expect(matchesWorktreeFilter(session({ id: "c" }), wt, "user")).toBe(false);
    expect(matchesWorktreeFilter(session({ id: "m" }), wt, "main")).toBe(true);
    // A session with no ref matches no concrete kind.
    expect(matchesWorktreeFilter(session({ id: "none" }), wt, "main")).toBe(false);
  });
});

describe("hasWorktrees", () => {
  it("is true when a claude or user worktree session exists", () => {
    expect(hasWorktrees([session({ id: "c" })], NONE, { c: ref({ kind: "claude" }) })).toBe(true);
    expect(hasWorktrees([session({ id: "u" })], NONE, { u: ref({ kind: "user" }) })).toBe(true);
  });
  it("is false for only-main or no worktrees, and ignores deleted", () => {
    expect(hasWorktrees([session({ id: "m" })], NONE, { m: ref({ kind: "main" }) })).toBe(false);
    expect(hasWorktrees([session({ id: "p" })], NONE, {})).toBe(false);
    expect(hasWorktrees([session({ id: "c" })], new Set(["c"]), { c: ref({ kind: "claude" }) })).toBe(
      false,
    );
  });
});

describe("buildWorktreeOptions", () => {
  it("leads with All and lists only the kinds present, with counts", () => {
    const sessions = [
      session({ id: "m" }),
      session({ id: "c1" }),
      session({ id: "c2" }),
      session({ id: "plain" }),
    ];
    const wt: WorktreeMap = {
      m: ref({ kind: "main" }),
      c1: ref({ kind: "claude" }),
      c2: ref({ kind: "claude" }),
    };
    const opts = buildWorktreeOptions(sessions, NONE, wt);
    expect(opts[0]).toEqual({ value: "all", label: "All checkouts", count: 4 });
    expect(opts.find((o) => o.value === "main")).toEqual({
      value: "main",
      label: "Main checkout",
      count: 1,
    });
    expect(opts.find((o) => o.value === "claude")?.count).toBe(2);
    // No user worktrees present → no user bucket offered.
    expect(opts.find((o) => o.value === "user")).toBeUndefined();
  });

  it("excludes deleted sessions from the counts", () => {
    const sessions = [session({ id: "c1" }), session({ id: "c2" })];
    const wt: WorktreeMap = { c1: ref({ kind: "claude" }), c2: ref({ kind: "claude" }) };
    const opts = buildWorktreeOptions(sessions, new Set(["c2"]), wt);
    expect(opts[0].count).toBe(1);
    expect(opts.find((o) => o.value === "claude")?.count).toBe(1);
  });
});
