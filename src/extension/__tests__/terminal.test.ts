import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import type { MockTerminal } from "../../__mocks__/vscode";
import { createTerminal, setExtensionUri } from "../terminal";

function makeTerminal(overrides: Partial<MockTerminal> = {}): MockTerminal {
  const t: MockTerminal = {
    name: "scratch",
    exitStatus: undefined,
    state: { isInteractedWith: false },
    sentText: [],
    sendText(text: string) {
      this.sentText.push(text);
    },
    show() {},
    dispose() {
      this.exitStatus = { code: 0 };
    },
    ...overrides,
  };
  return t;
}

function setConfig(values: Record<string, unknown>): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    get: (key: string, defaultValue?: unknown) =>
      key in values ? values[key] : defaultValue,
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

beforeEach(() => {
  vi.restoreAllMocks();
  (vscode.window as { terminals: MockTerminal[] }).terminals = [];
  vscode.window.tabGroups.all = [];
  setExtensionUri(undefined);
});

describe("createTerminal — reuse", () => {
  it("creates a new terminal when no candidates exist", () => {
    const term = createTerminal("Claude");
    expect(vscode.window.terminals).toHaveLength(1);
    expect(term.name).toBe("Claude");
  });

  it("reuses an empty, non-interacted terminal instead of creating a new one", () => {
    const existing = makeTerminal({ name: "bash" });
    vscode.window.terminals.push(existing);

    const term = createTerminal("Claude");

    expect(term).toBe(existing);
    expect(vscode.window.terminals).toHaveLength(1);
  });

  it("does not reuse a terminal the user has typed in", () => {
    const touched = makeTerminal({
      name: "bash",
      state: { isInteractedWith: true },
    });
    vscode.window.terminals.push(touched);

    const term = createTerminal("Claude");

    expect(term).not.toBe(touched);
    expect(vscode.window.terminals).toHaveLength(2);
  });

  it("does not reuse an exited terminal", () => {
    const dead = makeTerminal({
      name: "bash",
      exitStatus: { code: 0 },
    });
    vscode.window.terminals.push(dead);

    const term = createTerminal("Claude");

    expect(term).not.toBe(dead);
    expect(vscode.window.terminals).toHaveLength(2);
  });

  it("does not reuse a terminal it has already handed out (WeakSet guard)", () => {
    const empty = makeTerminal();
    vscode.window.terminals.push(empty);

    const first = createTerminal("Claude");
    const second = createTerminal("Claude");

    expect(first).toBe(empty);
    expect(second).not.toBe(empty);
    // isInteractedWith stays false in the mock because sendText doesn't flip
    // it — which is exactly the edge case the WeakSet guard exists for.
    expect(vscode.window.terminals).toHaveLength(2);
  });
});

describe("createTerminal — cwd handling", () => {
  it("sends `cd` to a reused terminal when cwd is provided", () => {
    const empty = makeTerminal();
    vscode.window.terminals.push(empty);

    createTerminal("Claude", "/home/user/project");

    expect(empty.sentText).toEqual([`cd "/home/user/project"`]);
  });

  it("normalizes Windows backslashes to forward slashes before `cd`", () => {
    const empty = makeTerminal();
    vscode.window.terminals.push(empty);

    createTerminal("Claude", "C:\\Users\\Me\\project");

    // Backslashes would be interpreted as escapes in git-bash; forward
    // slashes work in bash, zsh, cmd, powershell, and git-bash alike.
    expect(empty.sentText).toEqual([`cd "C:/Users/Me/project"`]);
  });

  it("does not send `cd` when no cwd is provided", () => {
    const empty = makeTerminal();
    vscode.window.terminals.push(empty);

    createTerminal("Claude");

    expect(empty.sentText).toEqual([]);
  });

  it("forwards cwd to createTerminal options for a newly-created terminal", () => {
    const term = createTerminal("Claude", "/home/user/project");
    expect(term.createOptions?.cwd).toBe("/home/user/project");
  });
});

describe("createTerminal — location", () => {
  it("uses undefined location (panel) when setting is 'panel'", () => {
    setConfig({ location: "panel" });

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toBeUndefined();
  });

  it("uses configured editorPosition when no existing terminal column is found", () => {
    setConfig({ location: "editor", editorPosition: "two" });

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Two,
    });
  });

  it("defaults to Beside when editorPosition is unknown", () => {
    setConfig({ location: "editor", editorPosition: "weird-value" });

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Beside,
    });
  });

  it("reuses an editor column that already hosts a Claude terminal", () => {
    setConfig({ location: "editor", editorPosition: "beside" });
    vscode.window.tabGroups.all = [
      {
        viewColumn: vscode.ViewColumn.Two,
        tabs: [
          { label: "Claude: abc123", input: new vscode.TabInputTerminal() },
        ],
      },
    ];

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Two,
    });
  });

  it("prefers a Claude column over a non-Claude column", () => {
    setConfig({ location: "editor", editorPosition: "beside" });
    vscode.window.tabGroups.all = [
      {
        viewColumn: vscode.ViewColumn.One,
        tabs: [{ label: "bash", input: new vscode.TabInputTerminal() }],
      },
      {
        viewColumn: vscode.ViewColumn.Three,
        tabs: [
          { label: "Claude: abc123", input: new vscode.TabInputTerminal() },
        ],
      },
    ];

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Three,
    });
  });

  it("falls back to any terminal column when no Claude column exists", () => {
    setConfig({ location: "editor", editorPosition: "beside" });
    vscode.window.tabGroups.all = [
      {
        viewColumn: vscode.ViewColumn.Two,
        tabs: [{ label: "bash", input: new vscode.TabInputTerminal() }],
      },
    ];

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Two,
    });
  });

  it("ignores non-terminal tabs when scanning tab groups", () => {
    setConfig({ location: "editor", editorPosition: "beside" });
    vscode.window.tabGroups.all = [
      {
        viewColumn: vscode.ViewColumn.Two,
        tabs: [{ label: "README.md", input: {} }],
      },
    ];

    const term = createTerminal("Claude");

    expect(term.createOptions?.location).toEqual({
      viewColumn: vscode.ViewColumn.Beside,
    });
  });
});

describe("setExtensionUri / icon path", () => {
  it("passes undefined icon when setExtensionUri has not been called", () => {
    const term = createTerminal("Claude");
    expect(term.createOptions?.iconPath).toBeUndefined();
  });

  it("wires the icon into createTerminal options after setExtensionUri is called", () => {
    setExtensionUri(vscode.Uri.file("/ext/root"));

    const term = createTerminal("Claude");

    const icon = term.createOptions?.iconPath as { path: string } | undefined;
    expect(icon?.path).toBe("/ext/root/media/terminal-icon.svg");
  });
});
