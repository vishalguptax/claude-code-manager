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
    expect(parseHooks(undefined)).toEqual([]);
  });

  it("tags entries from `hooks` as enabled", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Write", command: "echo a" }] },
      }),
    );
    const list = parseHooks(undefined);
    expect(list).toHaveLength(1);
    expect(list[0].disabled).toBe(false);
    expect(list[0].command).toBe("echo a");
  });

  it("tags entries from `_disabled_hooks` as disabled", () => {
    fs.writeFileSync(
      tmp.settings,
      JSON.stringify({
        _disabled_hooks: { PreToolUse: [{ matcher: "Write", command: "echo b" }] },
      }),
    );
    const list = parseHooks(undefined);
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
    const list = parseHooks(undefined);
    expect(list.map((h) => h.command)).toEqual(["active", "parked"]);
    expect(list.map((h) => h.disabled)).toEqual([false, true]);
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

    const list = parseHooks(undefined);
    expect(list[0].matcher).toBe("z");

    // Replace bytes (same length), restore the mtime. The cache key
    // (mtime + size) is unchanged, so the second parse must return
    // the cached list — it would not parse the new bytes.
    fs.writeFileSync(tmp.settings, replacement);
    fs.utimesSync(tmp.settings, fixedSec, fixedSec);

    const second = parseHooks(undefined);
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

    const hooks = parseHooks(undefined);
    const plug = hooks.find((h) => h.scope === "plugin");
    expect(plug).toBeDefined();
    expect(plug?.event).toBe("SessionStart");
    expect(plug?.command).toBe("echo hello");
    expect(plug?.pluginName).toBe("p@mkt");
    expect(plug?.disabled).toBe(false);
  });
});
