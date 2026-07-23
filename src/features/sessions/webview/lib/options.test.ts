import { describe, expect, it } from "vitest";
import type { Session } from "../../types";
import {
  buildBranchOptions,
  buildProjectOptions,
  listBranches,
  orderProjects,
} from "./options";

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

const NONE = new Set<string>();

describe("orderProjects", () => {
  it("orders projects with current first then by activity", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 10 }),
      session({ id: "b", project: "beta", projectKey: "beta", endTime: 99 }),
    ];
    expect(orderProjects(sessions, NONE, "alpha")).toEqual(["alpha", "beta"]);
  });

  it("falls back to activity ordering when no current project", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 10 }),
      session({ id: "b", project: "beta", projectKey: "beta", endTime: 99 }),
    ];
    expect(orderProjects(sessions, NONE, "")).toEqual(["beta", "alpha"]);
  });
});

describe("listBranches", () => {
  it("lists distinct branches with (no branch) last", () => {
    const sessions = [
      session({ id: "a", branch: "main" }),
      session({ id: "b", branch: "" }),
      session({ id: "c", branch: "dev" }),
    ];
    expect(listBranches(sessions, NONE)).toEqual(["dev", "main", "(no branch)"]);
  });

  it("excludes deleted sessions", () => {
    const sessions = [session({ id: "a", branch: "main" }), session({ id: "b", branch: "dev" })];
    expect(listBranches(sessions, new Set(["b"]))).toEqual(["main"]);
  });
});

describe("buildProjectOptions", () => {
  it("leads with the two scopes and tallies per-project counts", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 100 }),
      session({ id: "b", project: "alpha", projectKey: "alpha", endTime: 200 }),
      session({ id: "c", project: "beta", projectKey: "beta", endTime: 300 }),
    ];
    const opts = buildProjectOptions(sessions, NONE, "alpha");
    expect(opts[0]).toMatchObject({ value: "current", count: 2 });
    expect(opts[1]).toMatchObject({ value: "all", count: 3 });
    expect(opts.find((o) => o.value === "alpha")?.count).toBe(2);
  });

  it("excludes deleted sessions from every count", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha" }),
      session({ id: "b", project: "alpha", projectKey: "alpha" }),
    ];
    const all = buildProjectOptions(sessions, new Set(["b"]), "").find((o) => o.value === "all");
    expect(all?.count).toBe(1);
  });

  it("marks the workspace project with isCurrent and pins it after the two pseudos", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 100 }),
      session({ id: "b", project: "beta", projectKey: "beta", endTime: 999 }),
    ];
    const opts = buildProjectOptions(sessions, NONE, "alpha");
    expect(opts[0].value).toBe("current");
    expect(opts[1].value).toBe("all");
    expect(opts[2]).toMatchObject({ value: "alpha", isCurrent: true });
    expect(opts.find((o) => o.value === "beta")?.isCurrent).toBe(false);
  });

  it("leaves every project isCurrent=false when no workspace project is known", () => {
    const sessions = [session({ id: "a", project: "alpha", projectKey: "alpha" })];
    const opts = buildProjectOptions(sessions, NONE, "");
    expect(opts.find((o) => o.value === "alpha")?.isCurrent).toBe(false);
  });

  it("collapses every worktree of one repo into a single repoRoot entry", () => {
    // Three checkout dirs (feat / hotfix / main) all share repoRoot /repo.
    const sessions = [
      session({ id: "a", project: "feat", projectKey: "feat", endTime: 100 }),
      session({ id: "b", project: "hotfix", projectKey: "hotfix", endTime: 200 }),
      session({ id: "c", project: "repo", projectKey: "repo", endTime: 300 }),
      session({ id: "z", project: "other", projectKey: "other", endTime: 50 }),
    ];
    const worktrees = {
      a: { path: "/repo/feat", branch: "worktree-feat", kind: "claude" as const, exists: true, locked: false, repoRoot: "/repo" },
      b: { path: "/repo/hotfix", branch: "worktree-hotfix", kind: "user" as const, exists: true, locked: false, repoRoot: "/repo" },
      c: { path: "/repo", branch: "main", kind: "main" as const, exists: true, locked: false, repoRoot: "/repo" },
    };
    const opts = buildProjectOptions(sessions, NONE, "", worktrees);
    // One collapsed repo entry labelled by its basename, counting all 3 worktree sessions.
    const repo = opts.find((o) => o.value === "/repo");
    expect(repo).toMatchObject({ label: "repo", count: 3 });
    // The non-worktree project stays its own entry, and the checkout-dir names
    // never appear as separate options.
    expect(opts.find((o) => o.value === "other")?.count).toBe(1);
    expect(opts.some((o) => o.value === "feat" || o.value === "hotfix")).toBe(false);
  });

  it("marks the repo entry current and counts the whole repo when the workspace is a worktree", () => {
    const sessions = [
      session({ id: "a", project: "feat", projectKey: "feat", endTime: 100 }),
      session({ id: "b", project: "main", projectKey: "main", endTime: 200 }),
    ];
    const worktrees = {
      a: { path: "/repo/feat", branch: "worktree-feat", kind: "claude" as const, exists: true, locked: false, repoRoot: "/repo" },
      b: { path: "/repo", branch: "main", kind: "main" as const, exists: true, locked: false, repoRoot: "/repo" },
    };
    // Workspace is the feat worktree → repoRoot "/repo" is the current scope.
    const opts = buildProjectOptions(sessions, NONE, "feat", worktrees, "/repo");
    expect(opts[0]).toMatchObject({ value: "current", count: 2 });
    expect(opts.find((o) => o.value === "/repo")).toMatchObject({ isCurrent: true });
  });
});

describe("buildBranchOptions", () => {
  it("leads with All Branches, scopes counts, and marks the current branch", () => {
    const sessions = [
      session({ id: "a", branch: "main", endTime: 100 }),
      session({ id: "b", branch: "main", endTime: 200 }),
      session({ id: "c", branch: "dev", endTime: 300 }),
    ];
    const opts = buildBranchOptions(sessions, NONE, "main", "all", "");
    expect(opts[0]).toMatchObject({ value: "all", count: 3 });
    expect(opts[1]).toMatchObject({ value: "main", count: 2, isCurrent: true });
    expect(opts.find((o) => o.value === "dev")?.isCurrent).toBe(false);
  });

  it("buckets empty branches under (no branch)", () => {
    const sessions = [session({ id: "a", branch: "" })];
    const opts = buildBranchOptions(sessions, NONE, "", "all", "");
    expect(opts.some((o) => o.value === "(no branch)")).toBe(true);
  });

  it("scopes counts to the active project filter", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", branch: "main" }),
      session({ id: "b", project: "beta", projectKey: "beta", branch: "dev" }),
    ];
    const opts = buildBranchOptions(sessions, NONE, "", "alpha", "");
    expect(opts[0]).toMatchObject({ value: "all", count: 1 });
    expect(opts.some((o) => o.value === "dev")).toBe(false);
  });
});
