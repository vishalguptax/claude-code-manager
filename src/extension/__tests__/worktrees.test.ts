import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before importing the module under test so the module's
// `import { execFileSync }` binds to the mock.
const execFileSync = vi.fn();
vi.mock("child_process", () => ({ execFileSync: (...args: unknown[]) => execFileSync(...args) }));

import {
  parseWorktreePorcelain,
  classifyWorktree,
  resolveWorktree,
  resolveWorktrees,
  resolveMissingClaudeWorktree,
  findWorktreeForBranch,
  clearWorktreeCache,
} from "../worktrees";

/**
 * Drive the mocked git by mapping the subcommand (args joined) to canned
 * stdout. A key whose value is an Error is thrown (simulating "not a repo").
 */
function mockGit(responses: Record<string, string | Error>): void {
  execFileSync.mockImplementation((_bin: string, args: string[]) => {
    const key = args.join(" ");
    const found = responses[key];
    if (found === undefined) {
      throw new Error(`unexpected git invocation: git ${key}`);
    }
    if (found instanceof Error) throw found;
    return found;
  });
}

const LIST = "worktree list --porcelain";
const TOP = "rev-parse --path-format=absolute --show-toplevel";
const COMMON = "rev-parse --path-format=absolute --git-common-dir";

beforeEach(() => {
  execFileSync.mockReset();
  clearWorktreeCache();
});

describe("parseWorktreePorcelain", () => {
  it("parses main + linked worktrees, stripping refs/heads/", () => {
    const out = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /repo/.claude/worktrees/feature",
      "HEAD def456",
      "branch refs/heads/worktree-feature",
      "",
    ].join("\n");
    const list = parseWorktreePorcelain(out);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ path: "/repo", branch: "main" });
    expect(list[1]).toMatchObject({
      path: "/repo/.claude/worktrees/feature",
      branch: "worktree-feature",
    });
  });

  it("marks detached, bare, and locked entries", () => {
    const out = [
      "worktree /bare",
      "bare",
      "",
      "worktree /repo/wt",
      "HEAD abc",
      "detached",
      "locked session in use",
      "",
    ].join("\n");
    const list = parseWorktreePorcelain(out);
    expect(list[0].bare).toBe(true);
    expect(list[1].detached).toBe(true);
    expect(list[1].locked).toBe(true);
    expect(list[1].branch).toBe("");
  });

  it("treats a bare 'locked' line as locked", () => {
    const out = ["worktree /repo/wt", "HEAD abc", "branch refs/heads/x", "locked", ""].join("\n");
    expect(parseWorktreePorcelain(out)[0].locked).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(parseWorktreePorcelain("")).toEqual([]);
  });
});

describe("classifyWorktree", () => {
  it("returns main when flagged main regardless of path", () => {
    expect(classifyWorktree("/repo", "main", true)).toBe("main");
  });

  it("detects Claude worktrees by the .claude/worktrees/ path", () => {
    expect(classifyWorktree("/repo/.claude/worktrees/foo", "anything", false)).toBe("claude");
  });

  it("detects Claude worktrees by the worktree- branch prefix (relocated by hook)", () => {
    expect(classifyWorktree("/elsewhere/foo", "worktree-foo", false)).toBe("claude");
  });

  it("detects Claude PR worktrees by the pr-<number> branch", () => {
    expect(classifyWorktree("/elsewhere/pr", "pr-1234", false)).toBe("claude");
  });

  it("treats an arbitrary linked worktree as user-created", () => {
    expect(classifyWorktree("/work/feature-x", "feature-x", false)).toBe("user");
  });

  it("normalizes Windows separators when checking the path", () => {
    expect(classifyWorktree("C:\\repo\\.claude\\worktrees\\foo", "x", false)).toBe("claude");
  });
});

describe("resolveWorktree", () => {
  it("resolves a linked Claude worktree with repoRoot pointing at the main checkout", () => {
    mockGit({
      [TOP]: "/repo/.claude/worktrees/feat\n",
      [COMMON]: "/repo/.git\n",
      [LIST]: [
        "worktree /repo",
        "branch refs/heads/main",
        "",
        "worktree /repo/.claude/worktrees/feat",
        "branch refs/heads/worktree-feat",
        "locked",
        "",
      ].join("\n"),
    });
    const ref = resolveWorktree("/repo/.claude/worktrees/feat");
    expect(ref).toEqual({
      path: "/repo/.claude/worktrees/feat",
      branch: "worktree-feat",
      kind: "claude",
      exists: true,
      locked: true,
      repoRoot: "/repo",
    });
  });

  it("classifies the main checkout as main", () => {
    mockGit({
      [TOP]: "/repo\n",
      [COMMON]: "/repo/.git\n",
      [LIST]: ["worktree /repo", "branch refs/heads/main", ""].join("\n"),
    });
    const ref = resolveWorktree("/repo");
    expect(ref).toMatchObject({ kind: "main", repoRoot: "/repo", branch: "main" });
  });

  it("returns null when the directory is not a git repo", () => {
    mockGit({ [TOP]: new Error("fatal: not a git repository") });
    expect(resolveWorktree("/tmp/nope")).toBeNull();
  });

  it("caches the worktree list per common dir across calls", () => {
    mockGit({
      [TOP]: "/repo\n",
      [COMMON]: "/repo/.git\n",
      [LIST]: ["worktree /repo", "branch refs/heads/main", ""].join("\n"),
    });
    resolveWorktree("/repo");
    const listCalls = () =>
      execFileSync.mock.calls.filter((c) => (c[1] as string[]).join(" ") === LIST).length;
    expect(listCalls()).toBe(1);
    resolveWorktree("/repo");
    expect(listCalls()).toBe(1); // served from cache
    clearWorktreeCache();
    resolveWorktree("/repo");
    expect(listCalls()).toBe(2); // re-spawned after clear
  });
});

describe("resolveMissingClaudeWorktree", () => {
  it("synthesizes an exists:false ref for a removed Claude worktree when the repo root is a git repo", () => {
    // Only the repo-root show-toplevel probe is expected — the worktree dir
    // itself is gone, so live resolution never runs here.
    mockGit({ [TOP]: "/repo\n" });
    const ref = resolveMissingClaudeWorktree("/repo/.claude/worktrees/gone", "worktree-gone");
    expect(ref).toEqual({
      path: "/repo/.claude/worktrees/gone",
      branch: "worktree-gone",
      kind: "claude",
      exists: false,
      locked: false,
      repoRoot: "/repo",
    });
  });

  it("returns null when the path is not under .claude/worktrees/", () => {
    expect(resolveMissingClaudeWorktree("/repo/some/dir", "b")).toBeNull();
  });

  it("returns null when the derived repo root is not a git repo", () => {
    mockGit({ [TOP]: new Error("fatal: not a git repository") });
    expect(resolveMissingClaudeWorktree("/nope/.claude/worktrees/x", "b")).toBeNull();
  });

  it("derives the repo root from a Windows-style path", () => {
    mockGit({ [TOP]: "C:/repo\n" });
    const ref = resolveMissingClaudeWorktree("C:\\repo\\.claude\\worktrees\\gone", "b");
    expect(ref?.repoRoot).toBe("C:/repo");
    expect(ref?.path).toBe("C:\\repo\\.claude\\worktrees\\gone");
  });
});

describe("resolveWorktrees", () => {
  it("maps each input dir and omits non-repo dirs", () => {
    execFileSync.mockImplementation((_bin: string, args: string[], opts: { cwd: string }) => {
      const key = args.join(" ");
      if (opts.cwd === "/repo/wt") {
        if (key === TOP) return "/repo/wt\n";
        if (key === COMMON) return "/repo/.git\n";
        if (key === LIST)
          return ["worktree /repo", "branch refs/heads/main", "", "worktree /repo/wt", "branch refs/heads/x", ""].join("\n");
      }
      throw new Error("not a repo");
    });
    const map = resolveWorktrees(["/repo/wt", "/not/a/repo", ""]);
    expect(map.has("/repo/wt")).toBe(true);
    expect(map.get("/repo/wt")?.repoRoot).toBe("/repo");
    expect(map.has("/not/a/repo")).toBe(false);
    expect(map.has("")).toBe(false);
  });

  it("dedupes directories that normalize equal", () => {
    mockGit({
      [TOP]: "/repo\n",
      [COMMON]: "/repo/.git\n",
      [LIST]: ["worktree /repo", "branch refs/heads/main", ""].join("\n"),
    });
    resolveWorktrees(["/repo", "/repo/"]);
    const topCalls = execFileSync.mock.calls.filter(
      (c) => (c[1] as string[]).join(" ") === TOP,
    ).length;
    expect(topCalls).toBe(1);
  });
});

describe("findWorktreeForBranch", () => {
  it("returns the sibling worktree holding the branch, with repoRoot at main", () => {
    mockGit({
      [COMMON]: "/repo/.git\n",
      [LIST]: [
        "worktree /repo",
        "branch refs/heads/main",
        "",
        "worktree /repo/.claude/worktrees/feat",
        "branch refs/heads/worktree-feat",
        "locked",
        "",
      ].join("\n"),
    });
    const ref = findWorktreeForBranch("/repo", "worktree-feat");
    expect(ref).toEqual({
      path: "/repo/.claude/worktrees/feat",
      branch: "worktree-feat",
      kind: "claude",
      exists: true,
      locked: true,
      repoRoot: "/repo",
    });
  });

  it("returns null when no worktree has the branch", () => {
    mockGit({
      [COMMON]: "/repo/.git\n",
      [LIST]: ["worktree /repo", "branch refs/heads/main", ""].join("\n"),
    });
    expect(findWorktreeForBranch("/repo", "nonexistent")).toBeNull();
  });

  it("returns null for an empty branch without spawning git", () => {
    expect(findWorktreeForBranch("/repo", "")).toBeNull();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns null when the directory is not a git repo", () => {
    mockGit({ [COMMON]: new Error("fatal: not a git repository") });
    expect(findWorktreeForBranch("/tmp/nope", "main")).toBeNull();
  });

  it("shares the list cache with resolveWorktree (one list spawn per repo)", () => {
    mockGit({
      [TOP]: "/repo\n",
      [COMMON]: "/repo/.git\n",
      [LIST]: [
        "worktree /repo",
        "branch refs/heads/main",
        "",
        "worktree /repo/wt",
        "branch refs/heads/feature",
        "",
      ].join("\n"),
    });
    const listCalls = () =>
      execFileSync.mock.calls.filter((c) => (c[1] as string[]).join(" ") === LIST).length;
    resolveWorktree("/repo");
    expect(listCalls()).toBe(1);
    // Served from the shared cache — no second `worktree list`.
    const ref = findWorktreeForBranch("/repo", "feature");
    expect(ref?.path).toBe("/repo/wt");
    expect(listCalls()).toBe(1);
  });
});
