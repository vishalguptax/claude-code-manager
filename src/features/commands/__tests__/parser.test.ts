/**
 * Tests for the commands parser, including the built-in commands catalog
 * and parseCommands integration.
 */
import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { getBuiltInCommands, parseCommands } from "../parser";

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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-cmd-test-"));
    try {
      const projectCmdDir = path.join(tmpDir, ".claude", "commands");
      fs.mkdirSync(projectCmdDir, { recursive: true });
      fs.writeFileSync(path.join(projectCmdDir, "review.md"), "# Review");

      const cmds = parseCommands(tmpDir);
      const projectCmds = cmds.filter((c) => c.scope === "project");
      expect(projectCmds.find((c) => c.name === "review")).toBeDefined();

      const builtins = cmds.filter((c) => c.scope === "builtin");
      expect(builtins.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
