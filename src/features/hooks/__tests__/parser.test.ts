import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tmp = vi.hoisted(() => {
  const _fs = require("fs") as typeof import("fs");
  const _os = require("os") as typeof import("os");
  const _path = require("path") as typeof import("path");
  const dir = _fs.mkdtempSync(_path.join(_os.tmpdir(), "cm-hooks-parser-"));
  return { home: dir, settings: _path.join(dir, ".claude", "settings.json") };
});

vi.mock("os", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("os");
  return {
    ...actual,
    homedir: () => tmp.home,
  };
});

import { parseHooks } from "../parser";

beforeEach(() => {
  fs.mkdirSync(path.dirname(tmp.settings), { recursive: true });
  try {
    fs.unlinkSync(tmp.settings);
  } catch {
    // ignore
  }
});

describe("parseHooks disabled support", () => {
  it("returns an empty list when settings.json has no hook blocks", () => {
    fs.writeFileSync(tmp.settings, JSON.stringify({}));
    expect(parseHooks(undefined).hooks).toEqual([]);
  });

  it("tags entries from `hooks` as enabled", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Write", command: "echo a" }] },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list).toHaveLength(1);
    expect(list[0].disabled).toBe(false);
    expect(list[0].command).toBe("echo a");
  });

  it("records the record's position (entryIndex/commandIndex) for the flat shape", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { matcher: "Write", command: "echo a" },
            { matcher: "Edit", command: "echo b" },
          ],
        },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list.map((h) => h.entryIndex)).toEqual([0, 1]);
    expect(list.map((h) => h.commandIndex)).toEqual([null, null]);
    expect(list.map((h) => h.hookType)).toEqual(["command", "command"]);
  });

  it("records entryIndex + commandIndex for nested multi-command entries", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: "*",
              hooks: [
                { type: "command", command: "first" },
                { type: "command", command: "second" },
              ],
            },
          ],
        },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list.map((h) => h.entryIndex)).toEqual([0, 0]);
    expect(list.map((h) => h.commandIndex)).toEqual([0, 1]);
  });

  it("reads a record's timeout", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: "*", hooks: [{ type: "command", command: "echo", timeout: 30 }] }],
        },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list[0].timeout).toBe(30);
  });

  it("leaves timeout undefined when the record has none", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo a" }] } }),
    );
    expect(parseHooks(undefined).hooks[0].timeout).toBeUndefined();
  });

  it("surfaces non-command hook types (prompt/agent/http/mcp_tool) instead of dropping them", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: "*",
              hooks: [
                { type: "prompt", prompt: "Verify tests pass" },
                { type: "agent", prompt: "Run the reviewer agent" },
                { type: "http", url: "https://example.com/hook" },
                { type: "mcp_tool", tool: "my-server.do-thing" },
              ],
            },
          ],
        },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list.map((h) => h.hookType)).toEqual(["prompt", "agent", "http", "mcp_tool"]);
    expect(list.map((h) => h.command)).toEqual([
      "Verify tests pass",
      "Run the reviewer agent",
      "https://example.com/hook",
      "my-server.do-thing",
    ]);
  });

  it("skips a record with no command/prompt/url/tool to display", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: { Stop: [{ matcher: "*", hooks: [{ type: "command" }] }] },
      }),
    );
    expect(parseHooks(undefined).hooks).toEqual([]);
  });

  it("tags entries from `_disabled_hooks` as disabled", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        _disabled_hooks: { PreToolUse: [{ matcher: "Write", command: "echo b" }] },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list).toHaveLength(1);
    expect(list[0].disabled).toBe(true);
  });

  it("returns both blocks together, active first", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "x", command: "active" }] },
        _disabled_hooks: { PreToolUse: [{ matcher: "y", command: "parked" }] },
      }),
    );
    const list = parseHooks(undefined).hooks;
    expect(list.map((h) => h.command)).toEqual(["active", "parked"]);
    expect(list.map((h) => h.disabled)).toEqual([false, true]);
  });
});

describe("parseHooks error surfacing", () => {
  it("reports a malformed settings.json as an error instead of throwing", () => {
    fs.writeFileSync(tmp.settings, "{ not valid json");
    const result = parseHooks(undefined);
    expect(result.hooks).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(tmp.settings);
  });

  it("returns no errors when every scope parses cleanly", () => {
    fs.writeFileSync(tmp.settings, JSON.stringify({}));
    expect(parseHooks(undefined).errors).toEqual([]);
  });

  it("does not error on a missing settings file (ENOENT is normal)", () => {
    // beforeEach already deleted tmp.settings — nothing to write.
    expect(parseHooks(undefined).errors).toEqual([]);
  });
});

describe("parseHooks scopes", () => {
  const hookIn = (file: string, command: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [{ matcher: "", command }] } }));
  };

  it("reads project and local settings from the workspace", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "cm-hooks-ws-"));
    try {
      hookIn(tmp.settings, "g");
      hookIn(path.join(ws, ".claude", "settings.json"), "p");
      hookIn(path.join(ws, ".claude", "settings.local.json"), "l");
      const list = parseHooks(ws).hooks.filter((h) => h.scope !== "plugin");
      expect(list.map((h) => [h.scope, h.command])).toEqual([
        ["global", "g"],
        ["project", "p"],
        ["local", "l"],
      ]);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("lists global hooks once when the home folder is the workspace", () => {
    // ~/.claude/settings.json is the global file; reading it again as
    // "project" duplicated every hook under an uneditable label.
    hookIn(tmp.settings, "g");
    const local = path.join(tmp.home, ".claude", "settings.local.json");
    hookIn(local, "l");
    try {
      const list = parseHooks(tmp.home).hooks.filter((h) => h.scope !== "plugin");
      expect(list.map((h) => [h.scope, h.command])).toEqual([
        ["global", "g"],
        ["local", "l"],
      ]);
    } finally {
      fs.unlinkSync(local);
    }
  });
});

describe("parseHooks mtime caching", () => {
  it("returns cached hooks when settings.json mtime is unchanged", () => {
    const original = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "z", command: "echo z" }] },
    });
    // Replacement keeps the same byte length so the size component of
    // the cache key stays stable; mtime is restored explicitly below.
    const replacement = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Z", command: "echo Z" }] },
    });
    expect(replacement.length).toBe(original.length);

    fs.writeFileSync(tmp.settings, original);
    const fixedSec = Math.floor(Date.now() / 1000) - 600;
    fs.utimesSync(tmp.settings, fixedSec, fixedSec);

    const list = parseHooks(undefined).hooks;
    expect(list[0].matcher).toBe("z");

    // Replace bytes (same length), restore the mtime. The cache key
    // (mtime + size) is unchanged, so the second parse must return
    // the cached list — it would not parse the new bytes.
    fs.writeFileSync(tmp.settings, replacement);
    fs.utimesSync(tmp.settings, fixedSec, fixedSec);

    const second = parseHooks(undefined).hooks;
    expect(second[0].matcher).toBe("z");
  });
});

describe("parseHooks — plugin discovery", () => {
  it("surfaces hooks declared inline in a plugin manifest", () => {
    const pluginRoot = path.join(tmp.home, ".claude", "plugins", "cache", "mkt", "p", "v1");
    fs.mkdirSync(path.join(pluginRoot, ".claude-plugin"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "p",
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: "command", command: "echo hello" }],
            },
          ],
        },
      }),
    );

    fs.mkdirSync(path.join(tmp.home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp.home, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        plugins: { "p@mkt": [{ scope: "user", installPath: pluginRoot }] },
      }),
    );

    // Empty settings.json so global hooks contribute nothing.
    fs.writeFileSync(tmp.settings, JSON.stringify({}));

    const hooks = parseHooks(undefined).hooks;
    const plug = hooks.find((h) => h.scope === "plugin");
    expect(plug).toBeDefined();
    expect(plug?.event).toBe("SessionStart");
    expect(plug?.command).toBe("echo hello");
    expect(plug?.pluginName).toBe("p@mkt");
    expect(plug?.disabled).toBe(false);
  });
});
