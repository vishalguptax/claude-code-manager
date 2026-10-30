import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const tmp = vi.hoisted(() => {
  const _fs = require("fs") as typeof import("fs");
  const _os = require("os") as typeof import("os");
  const _path = require("path") as typeof import("path");
  const root = _fs.mkdtempSync(_path.join(_os.tmpdir(), "cm-claudecli-"));
  return { root, home: _path.join(root, "home"), claudeDir: _path.join(root, "home", ".claude") };
});

vi.mock("os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("os")>()),
  homedir: () => tmp.home,
}));
vi.mock("../../core/config", () => ({ CLAUDE_DIR: tmp.claudeDir }));

import { claudeCli, quoteProgram } from "../claudeCli";

const EXE = process.platform === "win32" ? "claude.exe" : "claude";
const pathDir = path.join(tmp.root, "bin");
const extDir = path.join(tmp.root, "ext");
const savedPath = process.env.PATH;

function touch(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
}

function officialExtension(installed: boolean): void {
  vi.spyOn(vscode.extensions, "getExtension").mockReturnValue(
    installed ? ({ extensionPath: extDir } as never) : undefined,
  );
}

beforeEach(() => {
  fs.rmSync(tmp.root, { recursive: true, force: true });
  fs.mkdirSync(pathDir, { recursive: true });
  process.env.PATH = pathDir;
  vscode.env.shell = "/bin/zsh";
});

afterEach(() => {
  process.env.PATH = savedPath;
  vi.restoreAllMocks();
});

describe("claudeCli", () => {
  it("uses the user's own claude from PATH even when the extension bundles one", () => {
    touch(path.join(pathDir, EXE));
    touch(path.join(extDir, "resources", "native-binary", EXE));
    officialExtension(true);
    expect(claudeCli()).toBe("claude");
  });

  it("counts the native installer's ~/.local/bin and the legacy local install", () => {
    officialExtension(true);
    touch(path.join(extDir, "resources", "native-binary", EXE));

    touch(path.join(tmp.home, ".local", "bin", "claude"));
    expect(claudeCli()).toBe("claude");

    fs.rmSync(path.join(tmp.home, ".local"), { recursive: true });
    touch(path.join(tmp.claudeDir, "local", "claude"));
    expect(claudeCli()).toBe("claude");
  });

  it("falls back to the official extension's bundled binary", () => {
    const bundled = path.join(extDir, "resources", "native-binary", EXE);
    touch(bundled);
    officialExtension(true);
    expect(claudeCli()).toBe(`'${bundled}'`);
  });

  it("prefers the per-platform binary when the extension ships several", () => {
    const perPlatform = path.join(
      extDir,
      "resources",
      "native-binaries",
      `${process.platform}-${process.arch}`,
      EXE,
    );
    touch(perPlatform);
    touch(path.join(extDir, "resources", "native-binary", EXE));
    officialExtension(true);
    expect(claudeCli()).toBe(`'${perPlatform}'`);
  });

  it("stays claude when neither exists, so the shell reports it missing", () => {
    officialExtension(false);
    expect(claudeCli()).toBe("claude");
    officialExtension(true);
    expect(claudeCli()).toBe("claude");
  });

  it("does not take a directory named claude for the program", () => {
    fs.mkdirSync(path.join(pathDir, "claude"));
    officialExtension(false);
    expect(claudeCli()).toBe("claude");
    officialExtension(true);
    const bundled = path.join(extDir, "resources", "native-binary", EXE);
    touch(bundled);
    expect(claudeCli()).toBe(`'${bundled}'`);
  });
});

describe("quoteProgram", () => {
  it("single-quotes for POSIX shells, escaping embedded quotes", () => {
    expect(quoteProgram("/a b/claude", "/bin/zsh")).toBe("'/a b/claude'");
    expect(quoteProgram("/it's/claude", "/bin/bash")).toBe("'/it'\\''s/claude'");
  });

  it("uses the call operator for PowerShell", () => {
    const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";
    expect(quoteProgram("C:\\x\\claude.exe", pwsh)).toBe("& 'C:\\x\\claude.exe'");
    expect(quoteProgram("C:\\o'k\\claude.exe", "powershell.exe")).toBe("& 'C:\\o''k\\claude.exe'");
  });

  it("double-quotes for cmd", () => {
    expect(quoteProgram("C:\\x\\claude.exe", "C:\\Windows\\System32\\cmd.exe")).toBe(
      '"C:\\x\\claude.exe"',
    );
  });
});
