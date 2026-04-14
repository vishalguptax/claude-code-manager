import { describe, it, expect, beforeEach } from "vitest";
import * as vscode from "vscode";
import { getWorkspace } from "../workspace";

interface MutableWorkspace {
  workspaceFolders: Array<{ uri: { fsPath: string }; name: string; index: number }>;
  getWorkspaceFolder: (
    uri: { fsPath: string },
  ) => { uri: { fsPath: string }; name: string; index: number } | undefined;
}

interface MutableWindow {
  activeTextEditor: { document: { uri: { fsPath: string } } } | undefined;
}

const ws = vscode.workspace as unknown as MutableWorkspace;
const win = vscode.window as unknown as MutableWindow;

beforeEach(() => {
  ws.workspaceFolders = [];
  ws.getWorkspaceFolder = () => undefined;
  win.activeTextEditor = undefined;
});

describe("getWorkspace", () => {
  it("returns empty string when no folder is open", () => {
    expect(getWorkspace()).toBe("");
  });

  it("returns empty string when workspaceFolders is undefined", () => {
    (ws as unknown as { workspaceFolders: undefined }).workspaceFolders = undefined;
    expect(getWorkspace()).toBe("");
  });

  it("returns the first folder's fsPath in single-root workspaces", () => {
    ws.workspaceFolders = [
      { uri: { fsPath: "/home/user/proj-a" }, name: "proj-a", index: 0 },
    ];
    expect(getWorkspace()).toBe("/home/user/proj-a");
  });

  it("returns the folder containing the active editor in multi-root workspaces", () => {
    const folderA = { uri: { fsPath: "/home/user/proj-a" }, name: "proj-a", index: 0 };
    const folderB = { uri: { fsPath: "/home/user/proj-b" }, name: "proj-b", index: 1 };
    ws.workspaceFolders = [folderA, folderB];
    win.activeTextEditor = { document: { uri: { fsPath: "/home/user/proj-b/file.ts" } } };
    ws.getWorkspaceFolder = (uri) =>
      uri.fsPath.startsWith("/home/user/proj-b") ? folderB : undefined;

    expect(getWorkspace()).toBe("/home/user/proj-b");
  });

  it("falls back to the first folder when active editor is outside any folder", () => {
    const folderA = { uri: { fsPath: "/home/user/proj-a" }, name: "proj-a", index: 0 };
    const folderB = { uri: { fsPath: "/home/user/proj-b" }, name: "proj-b", index: 1 };
    ws.workspaceFolders = [folderA, folderB];
    win.activeTextEditor = { document: { uri: { fsPath: "/tmp/outside.ts" } } };
    ws.getWorkspaceFolder = () => undefined;

    expect(getWorkspace()).toBe("/home/user/proj-a");
  });

  it("falls back to the first folder when no editor is active in multi-root", () => {
    ws.workspaceFolders = [
      { uri: { fsPath: "/home/user/proj-a" }, name: "proj-a", index: 0 },
      { uri: { fsPath: "/home/user/proj-b" }, name: "proj-b", index: 1 },
    ];
    win.activeTextEditor = undefined;

    expect(getWorkspace()).toBe("/home/user/proj-a");
  });
});
