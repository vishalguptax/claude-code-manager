import { describe, expect, it } from "vitest";
import type { Session } from "../../types";
import { matchesProject, matchesScope, type FilterScope } from "./scope";
import type { WorktreeMap } from "./worktrees";

function session(over: Partial<Session> & { id: string }): Session {
  return {
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 1000,
    endTime: 1000,
    messageCount: 1,
    summary: "",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    ...over,
  };
}

const NOW = 1_000_000_000_000;

function scope(over: Partial<FilterScope> = {}): FilterScope {
  return {
    deleted: new Set(),
    pinned: new Set(),
    project: "all",
    currentProject: "",
    date: "all",
    branch: "all",
    worktree: "all",
    worktrees: {},
    repoRoot: null,
    now: NOW,
    ...over,
  };
}

const ref = (repoRoot: string): WorktreeMap[string] => ({
  path: repoRoot,
  branch: "main",
  kind: "main",
  exists: true,
  locked: false,
  repoRoot,
});

describe("matchesProject — This Project", () => {
  it("keeps a session whose folder matches even without a worktree ref", () => {
    // The `worktrees` map arrives in a deferred message, and git cannot
    // resolve every directory. Requiring a ref dropped those sessions from
    // their own project.
    const s = session({ id: "a", projectKey: "proj" });
    const sc = scope({
      project: "current",
      currentProject: "proj",
      repoRoot: "/repo",
      worktrees: {},
    });
    expect(matchesProject(s, sc)).toBe(true);
  });

  it("spans sibling worktrees of the same repo", () => {
    const s = session({ id: "a", projectKey: "other" });
    const sc = scope({
      project: "current",
      currentProject: "proj",
      repoRoot: "/repo",
      worktrees: { a: ref("/repo") },
    });
    expect(matchesProject(s, sc)).toBe(true);
  });

  it("excludes a different project", () => {
    const s = session({ id: "a", projectKey: "elsewhere", project: "elsewhere" });
    const sc = scope({ project: "current", currentProject: "proj", repoRoot: null });
    expect(matchesProject(s, sc)).toBe(false);
  });

  it("shows everything while the workspace is still unresolved", () => {
    const s = session({ id: "a" });
    expect(matchesProject(s, scope({ project: "current" }))).toBe(true);
  });

  it("accepts a concrete selection by repoRoot or by project name", () => {
    const s = session({ id: "a", project: "proj" });
    // Selection made after worktrees resolved (value is a repoRoot)…
    expect(
      matchesProject(s, scope({ project: "/repo", worktrees: { a: ref("/repo") } })),
    ).toBe(true);
    // …and one persisted before they did (value is the project name).
    expect(
      matchesProject(s, scope({ project: "proj", worktrees: { a: ref("/repo") } })),
    ).toBe(true);
  });
});

describe("matchesScope", () => {
  const recent = session({ id: "recent", endTime: NOW - 1000, branch: "main" });
  const old = session({ id: "old", endTime: NOW - 40 * 86400000, branch: "dev" });

  it("applies every dimension together", () => {
    const sc = scope({ date: "week", branch: "main" });
    expect(matchesScope(recent, sc)).toBe(true);
    expect(matchesScope(old, sc)).toBe(false);
  });

  it("skips only the named dimension", () => {
    const sc = scope({ date: "week", branch: "dev" });
    // `old` fails both date and branch; excepting branch still fails on date.
    expect(matchesScope(old, sc, "branch")).toBe(false);
    expect(matchesScope(old, sc, "date")).toBe(true);
  });

  it("lets a pin survive the date cutoff but never a branch filter", () => {
    const sc = scope({ date: "week", pinned: new Set(["old"]) });
    expect(matchesScope(old, sc)).toBe(true);
    expect(matchesScope(old, { ...sc, branch: "main" })).toBe(false);
  });

  it("never admits a deleted session", () => {
    expect(matchesScope(recent, scope({ deleted: new Set(["recent"]) }))).toBe(false);
  });
});
