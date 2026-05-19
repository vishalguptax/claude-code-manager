/**
 * Tests for the commands parser, including the built-in commands catalog
 * and parseCommands integration (file scopes, TOML, plugin discovery).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as fs from "fs";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-cmd-home") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { getBuiltInCommands, parseCommands } from "../parser";

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});
afterEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("getBuiltInCommands", () => {
  it("returns a non-empty list of built-in commands", () => {
    const cmds = getBuiltInCommands();
    expect(cmds.length).toBeGreaterThan(40);
  });

  it("marks every entry with scope: builtin", () => {
    for (const c of getBuiltInCommands()) {
      expect(c.scope).toBe("builtin");
    }
  });

  it("includes well-known commands like /clear and /help", () => {
    const names = new Set(getBuiltInCommands().map((c) => c.name));
    expect(names.has("clear")).toBe(true);
    expect(names.has("help")).toBe(true);
    expect(names.has("model")).toBe(true);
    expect(names.has("compact")).toBe(true);
  });

  it("includes a description for each command", () => {
    for (const c of getBuiltInCommands()) {
      expect(typeof c.description).toBe("string");
      expect((c.description ?? "").length).toBeGreaterThan(0);
    }
  });

  it("returns commands with empty content and path", () => {
    for (const c of getBuiltInCommands()) {
      expect(c.content).toBe("");
      expect(c.path).toBe("");
    }
  });
});

describe("parseCommands", () => {
  it("includes built-ins even when no workspace is provided", () => {
    const cmds = parseCommands();
    const builtins = cmds.filter((c) => c.scope === "builtin");
    expect(builtins.length).toBeGreaterThan(40);
  });

  it("includes built-ins together with project commands", () => {
    const ws = path.join(HOME, "ws");
    const projectCmdDir = path.join(ws, ".claude", "commands");
    fs.mkdirSync(projectCmdDir, { recursive: true });
    fs.writeFileSync(path.join(projectCmdDir, "review.md"), "# Review");

    const cmds = parseCommands(ws);
    const projectCmds = cmds.filter((c) => c.scope === "project");
    expect(projectCmds.find((c) => c.name === "review")).toBeDefined();

    const builtins = cmds.filter((c) => c.scope === "builtin");
    expect(builtins.length).toBeGreaterThan(0);
  });

  it("reads .toml commands and extracts a basic-string description", () => {
    const ws = path.join(HOME, "ws-toml");
    const projectCmdDir = path.join(ws, ".claude", "commands");
    fs.mkdirSync(projectCmdDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectCmdDir, "yell.toml"),
      'description = "Make text loud"\nprompt = "shout {{args}}"\n',
    );
    const cmds = parseCommands(ws);
    const yell = cmds.find((c) => c.name === "yell" && c.scope === "project");
    expect(yell).toBeDefined();
    expect(yell?.description).toBe("Make text loud");
  });

  it("handles literal and multi-line TOML description forms", () => {
    const ws = path.join(HOME, "ws-toml2");
    const cmdDir = path.join(ws, ".claude", "commands");
    fs.mkdirSync(cmdDir, { recursive: true });
    fs.writeFileSync(
      path.join(cmdDir, "literal.toml"),
      "description = 'literal style'\nprompt = 'p'\n",
    );
    fs.writeFileSync(
      path.join(cmdDir, "multi.toml"),
      'description = """\nline a\nline b\n"""\nprompt = "p"\n',
    );
    const cmds = parseCommands(ws);
    expect(cmds.find((c) => c.name === "literal")?.description).toBe("literal style");
    expect(cmds.find((c) => c.name === "multi")?.description).toBe("line a\nline b");
  });
});

describe("parseCommands — plugin discovery", () => {
  it("surfaces plugin-provided commands (.md + .toml) with plugin scope", () => {
    const pluginRoot = path.join(HOME, ".claude", "plugins", "cache", "mkt", "k", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "{}");
    fs.mkdirSync(path.join(pluginRoot, "commands"), { recursive: true });
    fs.writeFileSync(path.join(pluginRoot, "commands", "foo.md"), "# foo");
    fs.writeFileSync(
      path.join(pluginRoot, "commands", "bar.toml"),
      'description = "Bar via TOML"\nprompt = "bar"\n',
    );

    fs.mkdirSync(path.join(HOME, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "k@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );

    const cmds = parseCommands();
    const foo = cmds.find((c) => c.name === "foo");
    const bar = cmds.find((c) => c.name === "bar");
    expect(foo?.scope).toBe("plugin");
    expect(foo?.pluginName).toBe("k@mkt");
    expect(bar?.scope).toBe("plugin");
    expect(bar?.description).toBe("Bar via TOML");
  });
});
