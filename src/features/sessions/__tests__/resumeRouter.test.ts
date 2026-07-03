import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

// Stub config paths so importing commands doesn't reach into real dirs.
vi.mock("../../../core/config", () => ({
  CLAUDE_DIR: "/tmp/irrelevant",
  HISTORY_FILE: "/tmp/irrelevant/history.jsonl",
  PROJECTS_DIR: "/tmp/irrelevant/projects",
  SESSIONS_DIR: "/tmp/irrelevant/sessions",
  STATE_FILE: "/tmp/irrelevant/.state.json",
  SESSION_META_READ_BYTES: 4096,
}));

/**
 * Capture sendText calls so tests can assert "terminal path was taken".
 * The createTerminal mock returns a handle whose sendText appends to
 * this array; a fresh array is rebuilt in beforeEach.
 */
let sentText: string[] = [];
vi.mock("../../../extension/terminal", () => ({
  createTerminal: () => ({
    show: () => {},
    sendText: (t: string) => {
      sentText.push(t);
    },
  }),
}));

// Import under test AFTER mocks.
import { resumeSession } from "../commands";
import type { Session } from "../types";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    name: "",
    project: "claude-manager",
    projectPath: "/work/claude-manager",
    branch: "main",
    entrypoint: "cli",
    startTime: 1700000000000,
    endTime: 1700000010000,
    messageCount: 1,
    summary: "",
    prompts: [],
    projectKey: "claude-manager",
    searchHaystack: "",
    ...overrides,
  };
}

/** Pretend the workspace IS the session's project so no cross-window jump. */
function mockSameWorkspace(sess: Session): void {
  (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
    { uri: { fsPath: sess.projectPath }, name: sess.project, index: 0 },
  ];
}

/** Pretend the workspace matches git branch too, so no branch warning. */
function mockBranch(branch: string): void {
  // getCurrentBranch uses vscode.extensions.getExtension("vscode.git").
  // Stub it to return a repo with the requested branch.
  vi.spyOn(vscode.extensions, "getExtension").mockImplementation((id: string) => {
    if (id === "vscode.git") {
      return {
        isActive: true,
        exports: {
          getAPI: () => ({
            repositories: [{ state: { HEAD: { name: branch } } }],
          }),
        },
      } as never;
    }
    if (id === "anthropic.claude-code") {
      return extensionPresent
        ? ({ isActive: true } as never)
        : (undefined as never);
    }
    return undefined as never;
  });
}

let extensionPresent = false;

/**
 * Mock a specific config value. Returns the spy so the caller can
 * restore it; vi.restoreAllMocks() in beforeEach wipes all spies.
 */
function mockResumeIn(value: string): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    get: (_key: string, defaultValue?: unknown) => {
      if (_key === "resumeIn") return value;
      return defaultValue;
    },
  } as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
  sentText = [];
  extensionPresent = false;
});

describe("resumeSession routing", () => {
  it("auto + entrypoint=cli → terminal", async () => {
    const sess = makeSession({ entrypoint: "cli" });
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("auto");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.some((t) => t.includes(`claude --resume ${sess.id}`))).toBe(true);
  });

  it("auto + entrypoint=vscode + extension installed → extension URI", async () => {
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("auto");
    const openSpy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const uri = openSpy.mock.calls[0][0] as { toString: () => string };
    expect(uri.toString()).toContain(`session=${sess.id}`);
    expect(sentText).toEqual([]);
  });

  it("auto + entrypoint=vscode but extension missing → terminal", async () => {
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = false;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("auto");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.length).toBeGreaterThan(0);
  });

  it("terminal mode → always terminal, ignoring entrypoint", async () => {
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("terminal");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.length).toBeGreaterThan(0);
  });

  it("extension mode + installed → URI", async () => {
    const sess = makeSession({ entrypoint: "cli" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("extension");
    const openSpy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(sentText).toEqual([]);
  });

  it("extension mode but not installed → silent fallback to terminal", async () => {
    const sess = makeSession({ entrypoint: "cli" });
    extensionPresent = false;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("extension");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.length).toBeGreaterThan(0);
  });

  it("fork is always terminal even when extension is installed", async () => {
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("extension");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, true /* fork */, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.some((t) => t.includes("--fork-session"))).toBe(true);
  });

  it("forceTerminal overrides extension mode (multi-session restore)", async () => {
    // Restore Workspace resumes N sessions; the extension chat tab is
    // single-instance, so it must force terminals or only the last survives.
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("extension");
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess], true /* forceTerminal */);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.some((t) => t.includes(`claude --resume ${sess.id}`))).toBe(true);
  });

  it("ask mode + user picks Extension → URI", async () => {
    const sess = makeSession({ entrypoint: "cli" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("ask");
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
      label: "Extension chat",
    } as never);
    const openSpy = vi
      .spyOn(vscode.env, "openExternal")
      .mockResolvedValue(true as never);

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(sentText).toEqual([]);
  });

  it("ask mode + user picks Terminal → terminal", async () => {
    const sess = makeSession({ entrypoint: "vscode" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("ask");
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue({
      label: "Terminal",
    } as never);
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText.length).toBeGreaterThan(0);
  });

  it("different project + extension mode → opens project, then fires URI after delay", async () => {
    vi.useFakeTimers();
    try {
      const sess = makeSession({
        entrypoint: "cli",
        projectPath: "/some/other/proj",
      });
      extensionPresent = true;
      // Workspace is the *current* project, session is in a *different* one.
      (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
        { uri: { fsPath: "/work/claude-manager" }, name: "cm", index: 0 },
      ];
      mockBranch("main");
      mockResumeIn("extension");
      const openProjectSpy = vi
        .spyOn(vscode.commands, "executeCommand")
        .mockResolvedValue(undefined as never);
      const openSpy = vi
        .spyOn(vscode.env, "openExternal")
        .mockResolvedValue(true as never);

      await resumeSession(sess.id, false, [sess]);

      // Project opens synchronously; URI is deferred.
      expect(openProjectSpy).toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();

      // Advance past the 3 s delay we use to let the new window
      // finish activating before routing the URI.
      vi.advanceTimersByTime(3100);
      await vi.runAllTimersAsync();

      expect(openSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ask mode + cancelled → neither target fires (clean bail-out)", async () => {
    const sess = makeSession({ entrypoint: "cli" });
    extensionPresent = true;
    mockSameWorkspace(sess);
    mockBranch("main");
    mockResumeIn("ask");
    vi.spyOn(vscode.window, "showQuickPick").mockResolvedValue(undefined as never);
    const openSpy = vi.spyOn(vscode.env, "openExternal");

    await resumeSession(sess.id, false, [sess]);

    // Cancelling the QuickPick is a deliberate no-op — the user
    // backed out, so neither destination should be launched.
    expect(openSpy).not.toHaveBeenCalled();
    expect(sentText).toEqual([]);
  });
});
