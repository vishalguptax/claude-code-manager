import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import type { WorktreeRef } from "../../../extension/worktrees";

// Stub config so importing commands doesn't reach into real dirs.
vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: "/tmp/irrelevant",
  HISTORY_FILE: "/tmp/irrelevant/history.jsonl",
  PROJECTS_DIR: "/tmp/irrelevant/projects",
  SESSIONS_DIR: "/tmp/irrelevant/sessions",
  STATE_FILE: "/tmp/irrelevant/.state.json",
  SESSION_META_READ_BYTES: 4096,
}));

// Capture every createTerminal call: its cwd + the commands sent to it. This
// is how the tests assert "resumed in place at the worktree path, no checkout".
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

let mockCurrentBranch = "main";
vi.mock("../../../extension/git", () => ({
  getCurrentBranch: () => mockCurrentBranch,
}));

let mockWorkspace = "";
vi.mock("../../../extension/workspace", () => ({
  getWorkspace: () => mockWorkspace,
}));

// Force terminal routing so resolveClaudeTarget never reaches the extension URI
// path — this suite is about the worktree/branch decisions, not the surface.
vi.mock("../../../extension/claudeCodeExtension", () => ({
  isClaudeCodeExtensionInstalled: () => false,
  openSessionInExtension: vi.fn(),
  openPromptInExtension: vi.fn(),
  isExtensionEntrypoint: () => false,
}));

let mockResolveWorktree: (dir: string) => WorktreeRef | null = () => null;
let mockFindWorktreeForBranch: (dir: string, branch: string) => WorktreeRef | null =
  () => null;
const clearWorktreeCache = vi.fn();
vi.mock("../../../extension/worktrees", () => ({
  resolveWorktree: (dir: string) => mockResolveWorktree(dir),
  findWorktreeForBranch: (dir: string, branch: string) =>
    mockFindWorktreeForBranch(dir, branch),
  clearWorktreeCache: () => clearWorktreeCache(),
}));

import { resumeSession } from "../commands";
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

function worktreeRef(path: string, kind: WorktreeRef["kind"] = "claude"): WorktreeRef {
  return { path, branch: "worktree-feat", kind, exists: true, locked: false, repoRoot: "/repo" };
}

function forceTerminalResumeIn(): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    get: (_key: string, def?: unknown) => (_key === "resumeIn" ? "terminal" : def),
  } as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
  terminalCalls = [];
  clearWorktreeCache.mockReset();
  mockCurrentBranch = "main";
  mockResolveWorktree = () => null;
  mockFindWorktreeForBranch = () => null;
  forceTerminalResumeIn();
});

describe("resumeSession — worktree aware", () => {
  it("resumes in place when the session ran in a live worktree, no checkout or warning", async () => {
    const sess = makeSession(); // projectPath is a live Claude worktree
    mockWorkspace = sess.projectPath;
    // Even a branch mismatch must be ignored for a live worktree session.
    mockCurrentBranch = "main";
    mockResolveWorktree = (dir) =>
      dir === sess.projectPath ? worktreeRef(sess.projectPath) : null;
    const warn = vi.spyOn(vscode.window, "showWarningMessage");

    await resumeSession(sess.id, false, [sess]);

    expect(warn).not.toHaveBeenCalled();
    expect(clearWorktreeCache).toHaveBeenCalled();
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0].cwd).toBe(sess.projectPath);
    expect(terminalCalls[0].sent).toEqual([`claude --resume ${sess.id}`]);
    // No git checkout was injected.
    expect(terminalCalls[0].sent.some((t) => t.includes("git checkout"))).toBe(false);
  });

  it("offers Open worktree when the branch is live in a different worktree", async () => {
    const sess = makeSession({
      projectPath: "/repo",
      branch: "worktree-feat",
    });
    mockWorkspace = "/repo";
    mockCurrentBranch = "main"; // mismatch vs the session branch
    // The session dir is the main checkout — not a live worktree.
    mockResolveWorktree = () => worktreeRef("/repo", "main");
    // …but the branch is checked out in a sibling worktree.
    mockFindWorktreeForBranch = (_dir, branch) =>
      branch === "worktree-feat" ? worktreeRef("/repo/.claude/worktrees/feat") : null;
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue("Open worktree" as never);

    await resumeSession(sess.id, false, [sess]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("checked out in another worktree");
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0].cwd).toBe("/repo/.claude/worktrees/feat");
    expect(terminalCalls[0].sent).toEqual([`claude --resume ${sess.id}`]);
    expect(terminalCalls[0].sent.some((t) => t.includes("git checkout"))).toBe(false);
  });

  it("falls back to the in-place Switch & Resume checkout for a main-checkout mismatch", async () => {
    const sess = makeSession({ projectPath: "/repo", branch: "feature" });
    mockWorkspace = "/repo";
    mockCurrentBranch = "main"; // mismatch
    mockResolveWorktree = () => worktreeRef("/repo", "main");
    mockFindWorktreeForBranch = () => null; // branch not live in any worktree
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue("Switch & Resume" as never);

    await resumeSession(sess.id, false, [sess]);

    expect(warn.mock.calls[0][0]).toContain('but you\'re on "main"');
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0].sent).toEqual([`git checkout 'feature' && claude --resume ${sess.id}`]);
  });

  it("Open worktree is not offered when the found worktree is the current dir", async () => {
    // findWorktreeForBranch returning the same path as cwd must not trigger the
    // redirect — it would be a no-op hop. Fall through to the checkout flow.
    const sess = makeSession({ projectPath: "/repo", branch: "feature" });
    mockWorkspace = "/repo";
    mockCurrentBranch = "main";
    mockResolveWorktree = () => worktreeRef("/repo", "main");
    mockFindWorktreeForBranch = () => worktreeRef("/repo", "main");
    const warn = vi
      .spyOn(vscode.window, "showWarningMessage")
      .mockResolvedValue("Resume Anyway" as never);

    await resumeSession(sess.id, false, [sess]);

    expect(warn.mock.calls[0][0]).toContain("but you're on");
  });
});
