import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const tmp = vi.hoisted(() => {
  const fsLocal = require("fs") as typeof import("fs");
  const osLocal = require("os") as typeof import("os");
  const pathLocal = require("path") as typeof import("path");
  return { root: fsLocal.mkdtempSync(pathLocal.join(osLocal.tmpdir(), "cm-clititle-")) };
});

vi.mock("../../../core/config", () => ({
  claudeSettingsPath: (scope: string, workspacePath?: string) => {
    if (scope === "global") return path.join(tmp.root, "global.json");
    if (!workspacePath) return null;
    return path.join(workspacePath, scope === "local" ? "settings.local.json" : "settings.json");
  },
}));

import { readCliTitlePolicy } from "../cliTitle";

const ws = path.join(tmp.root, "ws");

function write(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data));
}

beforeEach(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.mkdirSync(ws, { recursive: true });
  fs.rmSync(path.join(tmp.root, "global.json"), { force: true });
});

describe("readCliTitlePolicy", () => {
  it("defaults to a CLI that writes its title, rename first", () => {
    expect(readCliTitlePolicy(ws, {})).toEqual({ writesTitle: true, fromRename: true });
  });

  it("reads CLAUDE_CODE_DISABLE_TERMINAL_TITLE from the host environment", () => {
    expect(readCliTitlePolicy(ws, { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1" }).writesTitle).toBe(false);
    expect(readCliTitlePolicy(ws, { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "true" }).writesTitle).toBe(false);
  });

  it("ignores a falsy value of the variable", () => {
    expect(readCliTitlePolicy(ws, { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "0" }).writesTitle).toBe(true);
    expect(readCliTitlePolicy(ws, { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "" }).writesTitle).toBe(true);
  });

  it("reads the variable from any settings file's env block", () => {
    write(path.join(ws, "settings.local.json"), { env: { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1" } });
    expect(readCliTitlePolicy(ws, {}).writesTitle).toBe(false);
  });

  it("lets a later settings file override terminalTitleFromRename", () => {
    write(path.join(tmp.root, "global.json"), { terminalTitleFromRename: false });
    expect(readCliTitlePolicy(ws, {}).fromRename).toBe(false);

    write(path.join(ws, "settings.json"), { terminalTitleFromRename: true });
    expect(readCliTitlePolicy(ws, {}).fromRename).toBe(true);
  });

  it("reads only the global file without a workspace", () => {
    write(path.join(ws, "settings.json"), { env: { CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1" } });
    expect(readCliTitlePolicy(undefined, {}).writesTitle).toBe(true);
  });

  it("skips a settings file that does not parse", () => {
    fs.writeFileSync(path.join(tmp.root, "global.json"), "{ not json");
    expect(readCliTitlePolicy(ws, {})).toEqual({ writesTitle: true, fromRename: true });
  });
});
