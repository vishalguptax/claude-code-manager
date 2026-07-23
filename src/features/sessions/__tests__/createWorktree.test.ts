import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: "/tmp/irrelevant",
  HISTORY_FILE: "/tmp/irrelevant/history.jsonl",
  PROJECTS_DIR: "/tmp/irrelevant/projects",
  SESSIONS_DIR: "/tmp/irrelevant/sessions",
  STATE_FILE: "/tmp/irrelevant/.state.json",
  SESSION_META_READ_BYTES: 4096,
}));

// Existence is driven by this set so each test declares exactly which paths
// are on disk (worktree dir, repo root, repo .git). Real fs otherwise, so any
// module importing fs keeps working.
let existing: Set<string>;
vi.mock("fs", async (importActual) => {
  const actual = await importActual<typeof import("fs")>();
  return { ...actual, existsSync: (p: string) => existing.has(p) };
});

// Capture the git spawn so tests can assert an ARGUMENT ARRAY (no shell).
// Real module otherwise (procTime.ts promisifies execFile at import time).
const execFileSync = vi.fn();
vi.mock("child_process", async (importActual) => {
  const actual = await importActual<typeof import("child_process")>();
  return { ...actual, execFileSync: (...args: unknown[]) => execFileSync(...args) };
});

interface TermCall {
  name: string;
  cwd?: string;
  sessionId?: string;
  sent: string[];
}
let terminalCalls: TermCall[] = [];
vi.mock("../../../extension/terminal", () => ({
  createTerminal: (name: string, cwd?: string, sessionId?: string) => {
    const rec: TermCall = { name, cwd, sessionId, sent: [] };
    terminalCalls.push(rec);
    return { show: () => {}, sendText: (t: string) => rec.sent.push(t) };
  },
  validateGitRef: (n: string) => (/^[A-Za-z0-9._/-]+$/.test(n) ? n : null),
}));

// worktrees is imported at commands.ts module load but unused by this command;
// stub so no git is spawned on import.
vi.mock("../../../extension/worktrees", () => ({
  resolveWorktree: vi.fn(() => null),
  findWorktreeForBranch: vi.fn(() => null),
  clearWorktreeCache: vi.fn(),
}));

import { createWorktreeForSession } from "../commands";
import type { Session } from "../types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    name: "",
    project: "repo",
    projectPath: "/repo/.claude/worktrees/feat",
    branch: "worktree-feat",
    entrypoint: "cli",
    startTime: 1,
    endTime: 2,
    messageCount: 1,
    summary: "",
    prompts: [],
    projectKey: "repo",
    searchHaystack: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  existing = new Set();
  execFileSync.mockReset();
  terminalCalls = [];
});

describe("createWorktreeForSession", () => {
  it("recreates via git worktree add with array args, then resumes", async () => {
    const sess = makeSession();
    // Worktree gone; repo root present and a git repo.
    existing = new Set(["/repo", "/repo/.git"]);
    execFileSync.mockReturnValue("");
    const confirm = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue("Recreate & Resume" as never);

    await createWorktreeForSession(sess.id, [sess]);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [bin, args] = execFileSync.mock.calls[0];
    expect(bin).toBe("git");
    expect(args).toEqual([
      "-C",
      "/repo",
      "worktree",
      "add",
      "/repo/.claude/worktrees/feat",
      "worktree-feat",
    ]);
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0].cwd).toBe("/repo/.claude/worktrees/feat");
    expect(terminalCalls[0].sent).toEqual([`claude --resume ${sess.id}`]);
  });

  it("rejects a path that is not a Claude worktree", async () => {
    const sess = makeSession({ projectPath: "/some/user/project" });
    existing = new Set(["/some/user/project-nope"]); // path itself absent
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await createWorktreeForSession(sess.id, [sess]);

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("isn't a Claude-created worktree"),
    );
    expect(execFileSync).not.toHaveBeenCalled();
    expect(terminalCalls).toHaveLength(0);
  });

  it("resumes in the existing worktree instead of recreating when it is still on disk", async () => {
    const sess = makeSession();
    existing = new Set(["/repo/.claude/worktrees/feat"]); // worktree still present
    const confirm = vi.spyOn(vscode.window, "showWarningMessage");

    await createWorktreeForSession(sess.id, [sess]);

    expect(confirm).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0].cwd).toBe("/repo/.claude/worktrees/feat");
    expect(terminalCalls[0].sent).toEqual([`claude --resume ${sess.id}`]);
  });

  it("refuses a branch that fails ref validation", async () => {
    const sess = makeSession({ branch: 'x" && rm -rf /' });
    existing = new Set(["/repo", "/repo/.git"]);
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await createWorktreeForSession(sess.id, [sess]);

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("not a valid git branch name"),
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("bails when the derived repo root is not a git repo", async () => {
    const sess = makeSession();
    existing = new Set(["/repo"]); // repo dir present but no .git
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await createWorktreeForSession(sess.id, [sess]);

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("no longer exists on this machine"),
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("does nothing when the user cancels the confirm", async () => {
    const sess = makeSession();
    existing = new Set(["/repo", "/repo/.git"]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(undefined);

    await createWorktreeForSession(sess.id, [sess]);

    expect(execFileSync).not.toHaveBeenCalled();
    expect(terminalCalls).toHaveLength(0);
  });

  it("surfaces git stderr when the worktree add fails", async () => {
    const sess = makeSession();
    existing = new Set(["/repo", "/repo/.git"]);
    vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      "Recreate & Resume" as never,
    );
    execFileSync.mockImplementation(() => {
      const e = new Error("Command failed") as Error & { stderr: string };
      e.stderr = "fatal: 'worktree-feat' is already checked out";
      throw e;
    });
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);

    await createWorktreeForSession(sess.id, [sess]);

    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("already checked out"),
    );
    expect(terminalCalls).toHaveLength(0);
  });

  it("errors when the session is not in the list", async () => {
    const err = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await createWorktreeForSession("missing", []);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("Session not found"));
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
