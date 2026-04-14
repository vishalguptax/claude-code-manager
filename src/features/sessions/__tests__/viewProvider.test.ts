import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import {
  _fireWorkspaceFoldersChange,
  _resetListeners,
} from "../../../__mocks__/vscode";

interface MutableWorkspace {
  workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
}

const ws = vscode.workspace as unknown as MutableWorkspace;

interface PostedMsg {
  type: string;
  data?: unknown;
  defaultFilter?: unknown;
  defaultProject?: unknown;
  restoreWindowMinutes?: unknown;
}

interface FakeWebview {
  options: unknown;
  html: string;
  posted: PostedMsg[];
  postMessage: (msg: PostedMsg) => void;
  onDidReceiveMessage: (handler: (msg: unknown) => void) => { dispose: () => void };
}

interface FakeWebviewView {
  webview: FakeWebview;
  onDidDispose: (cb: () => void) => { dispose: () => void };
  _disposeCallbacks: Array<() => void>;
  _dispose: () => void;
}

function makeFakeView(): FakeWebviewView {
  const view: FakeWebviewView = {
    webview: {
      options: undefined,
      html: "",
      posted: [],
      postMessage(msg: PostedMsg) {
        this.posted.push(msg);
      },
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    },
    onDidDispose(cb: () => void) {
      view._disposeCallbacks.push(cb);
      return { dispose: () => {} };
    },
    _disposeCallbacks: [],
    _dispose() {
      for (const cb of view._disposeCallbacks) cb();
    },
  };
  return view;
}

beforeEach(() => {
  vi.restoreAllMocks();
  _resetListeners();
  ws.workspaceFolders = [];
});

describe("ClaudeSessionViewProvider", () => {
  it("posts the current workspace path to the webview when folders change", async () => {
    // Provider pulls in many feature parsers. Stub their disk reads so import
    // is safe in a test env that has no ~/.claude.
    vi.doMock("../parser", () => ({
      parseSessions: () => [],
      parseSessionDetail: () => null,
      groupSessions: () => [],
      getStats: () => ({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 }),
      getUniqueProjects: () => [],
      searchSessions: () => [],
      filterSessions: () => [],
      getLastParseWarning: () => null,
    }));
    vi.doMock("../state", () => ({
      loadState: () => ({ pinned: [], deleted: [], renames: {} }),
      pinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      unpinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      deleteSession: () => ({ pinned: [], deleted: [], renames: {} }),
      renameSession: () => ({ pinned: [], deleted: [], renames: {} }),
    }));
    vi.doMock("../../../extension/html", () => ({
      getWebviewHtml: () => "<html></html>",
    }));

    const { ClaudeSessionViewProvider } = await import("../viewProvider");
    const provider = new ClaudeSessionViewProvider({ fsPath: "/ext" } as vscode.Uri);

    const view = makeFakeView();
    provider.resolveWebviewView(view as unknown as vscode.WebviewView);

    // Workspace was empty at resolve time. Now folders arrive.
    ws.workspaceFolders = [
      { uri: { fsPath: "/home/user/proj" }, name: "proj", index: 0 },
    ];
    _fireWorkspaceFoldersChange();

    const workspaceMsgs = view.webview.posted.filter((m) => m.type === "workspacePath");
    expect(workspaceMsgs.length).toBeGreaterThanOrEqual(1);
    expect(workspaceMsgs[workspaceMsgs.length - 1].data).toBe("/home/user/proj");
  });

  it("refreshSettings posts the current settings message to the webview", async () => {
    vi.doMock("../parser", () => ({
      parseSessions: () => [],
      parseSessionDetail: () => null,
      groupSessions: () => [],
      getStats: () => ({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 }),
      getUniqueProjects: () => [],
      searchSessions: () => [],
      filterSessions: () => [],
      getLastParseWarning: () => null,
    }));
    vi.doMock("../state", () => ({
      loadState: () => ({ pinned: [], deleted: [], renames: {} }),
      pinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      unpinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      deleteSession: () => ({ pinned: [], deleted: [], renames: {} }),
      renameSession: () => ({ pinned: [], deleted: [], renames: {} }),
    }));
    vi.doMock("../../../extension/html", () => ({
      getWebviewHtml: () => "<html></html>",
    }));

    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          defaultFilter: "month",
          defaultProject: "all",
          restoreWindowMinutes: 60,
        };
        return key in values ? values[key] : defaultValue;
      },
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const { ClaudeSessionViewProvider } = await import("../viewProvider");
    const provider = new ClaudeSessionViewProvider({ fsPath: "/ext" } as vscode.Uri);

    const view = makeFakeView();
    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    view.webview.posted.length = 0;

    provider.refreshSettings();

    const settingsMsgs = view.webview.posted.filter((m) => m.type === "settings");
    expect(settingsMsgs).toHaveLength(1);
    expect(settingsMsgs[0].defaultFilter).toBe("month");
    expect(settingsMsgs[0].defaultProject).toBe("all");
    expect(settingsMsgs[0].restoreWindowMinutes).toBe(60);
  });

  it("postWorkspacePath silently ignores posts after the view is disposed", async () => {
    vi.doMock("../parser", () => ({
      parseSessions: () => [],
      parseSessionDetail: () => null,
      groupSessions: () => [],
      getStats: () => ({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 }),
      getUniqueProjects: () => [],
      searchSessions: () => [],
      filterSessions: () => [],
      getLastParseWarning: () => null,
    }));
    vi.doMock("../state", () => ({
      loadState: () => ({ pinned: [], deleted: [], renames: {} }),
      pinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      unpinSession: () => ({ pinned: [], deleted: [], renames: {} }),
      deleteSession: () => ({ pinned: [], deleted: [], renames: {} }),
      renameSession: () => ({ pinned: [], deleted: [], renames: {} }),
    }));
    vi.doMock("../../../extension/html", () => ({
      getWebviewHtml: () => "<html></html>",
    }));

    const { ClaudeSessionViewProvider } = await import("../viewProvider");
    const provider = new ClaudeSessionViewProvider({ fsPath: "/ext" } as vscode.Uri);

    const view = makeFakeView();
    provider.resolveWebviewView(view as unknown as vscode.WebviewView);
    view._dispose();

    // After dispose, refreshSettings and the workspace-folder change handler
    // should both no-op rather than throw or push to a stale view.
    const before = view.webview.posted.length;
    provider.refreshSettings();
    ws.workspaceFolders = [
      { uri: { fsPath: "/some/where" }, name: "where", index: 0 },
    ];
    _fireWorkspaceFoldersChange();
    expect(view.webview.posted.length).toBe(before);
  });
});
