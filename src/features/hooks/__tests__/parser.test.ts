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
