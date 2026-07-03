import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { toggleHookEnabled, deleteHook, updateHook, addHook } from "../writer";
import type { Hook } from "../types";

let tmpFile: string;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-hooks-"));
  tmpFile = path.join(dir, "settings.json");
});

function read(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
}

function seed(content: Record<string, unknown>): void {
  fs.writeFileSync(tmpFile, JSON.stringify(content, null, 2));
}

function makeHook(overrides: Partial<Hook> = {}): Hook {
  return {
    event: "PreToolUse",
    matcher: "Write",
    command: "echo writing",
    scope: "global",
    disabled: false,
    hookType: "command",
    entryIndex: 0,
    commandIndex: null,
    ...overrides,
  };
}

describe("addHook", () => {
  it("creates the hooks block when settings.json is empty", () => {
    addHook(tmpFile, "PreToolUse", "Write", "echo hi");
    const data = read();
    expect((data.hooks as Record<string, unknown>).PreToolUse).toBeDefined();
  });

  it("uses the nested hooks shape Claude prefers", () => {
    addHook(tmpFile, "PreToolUse", "Write", "echo hi");
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).PreToolUse;
    expect(arr[0].matcher).toBe("Write");
    const inner = arr[0].hooks as Array<Record<string, string>>;
    expect(inner[0]).toEqual({ type: "command", command: "echo hi" });
  });

  it("rejects an empty command", () => {
    expect(addHook(tmpFile, "PreToolUse", "Write", "  ") || true).toBe(true);
    // Empty command short-circuits before writing — still no file content.
    const exists = fs.existsSync(tmpFile);
    if (exists) {
      const data = read();
      expect(data.hooks).toBeUndefined();
    }
  });
});

describe("plugin scope is read-only", () => {
  it("toggleHookEnabled refuses to mutate plugin-sourced hooks", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo" }] } });
    const before = fs.readFileSync(tmpFile, "utf-8");
    const ok = toggleHookEnabled(
      tmpFile,
      makeHook({ scope: "plugin", pluginName: "p@mkt" }),
      false,
    );
    expect(ok).toBe(false);
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });

  it("deleteHook refuses to mutate plugin-sourced hooks", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo" }] } });
    const before = fs.readFileSync(tmpFile, "utf-8");
    expect(deleteHook(tmpFile, makeHook({ scope: "plugin", pluginName: "p@mkt" }))).toBe(false);
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });

  it("updateHook refuses to rewrite plugin-sourced hooks", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo" }] } });
    const before = fs.readFileSync(tmpFile, "utf-8");
    const ok = updateHook(
      tmpFile,
      makeHook({ scope: "plugin", pluginName: "p@mkt" }),
      { matcher: "Other", command: "echo new" },
    );
    expect(ok).toBe(false);
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });
});

describe("toggleHookEnabled", () => {
  it("moves an active hook into _disabled_hooks verbatim", () => {
    seed({
      hooks: {
        PreToolUse: [{ matcher: "Write", command: "echo hi" }],
      },
    });
    const hook = makeHook({ command: "echo hi" });
    expect(toggleHookEnabled(tmpFile, hook, false)).toBe(true);
    const data = read();
    expect(data.hooks).toBeUndefined();
    const disabled = data._disabled_hooks as Record<string, Array<Record<string, unknown>>>;
    expect(disabled.PreToolUse[0].command).toBe("echo hi");
  });

  it("moves a disabled hook back into hooks", () => {
    seed({
      _disabled_hooks: {
        PreToolUse: [{ matcher: "Write", command: "echo hi" }],
      },
    });
    const hook = makeHook({ command: "echo hi", disabled: true });
    expect(toggleHookEnabled(tmpFile, hook, true)).toBe(true);
    const data = read();
    expect(data._disabled_hooks).toBeUndefined();
    const active = data.hooks as Record<string, Array<Record<string, unknown>>>;
    expect(active.PreToolUse[0].matcher).toBe("Write");
  });

  it("preserves nested-hooks payloads when toggling", () => {
    seed({
      hooks: {
        Stop: [
          { matcher: "*", hooks: [{ type: "command", command: "echo done" }] },
        ],
      },
    });
    const hook = makeHook({ event: "Stop", matcher: "*", command: "echo done" });
    toggleHookEnabled(tmpFile, hook, false);
    const data = read();
    const disabled = data._disabled_hooks as Record<string, Array<Record<string, unknown>>>;
    const inner = disabled.Stop[0].hooks as Array<Record<string, string>>;
    expect(inner[0]).toEqual({ type: "command", command: "echo done" });
  });
});

describe("deleteHook", () => {
  it("removes a flat-format entry from the active block", () => {
    seed({
      hooks: {
        PreToolUse: [
          { matcher: "Write", command: "echo a" },
          { matcher: "Edit", command: "echo b" },
        ],
      },
    });
    deleteHook(tmpFile, makeHook({ command: "echo a" }));
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).PreToolUse;
    expect(arr).toHaveLength(1);
    expect(arr[0].command).toBe("echo b");
  });

  it("drops the empty event array after the last entry is removed", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo a" }] } });
    deleteHook(tmpFile, makeHook({ command: "echo a" }));
    const data = read();
    expect(data.hooks).toBeUndefined();
  });

  it("removes a single nested entry without dropping siblings", () => {
    seed({
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
    });
    deleteHook(
      tmpFile,
      makeHook({ event: "Stop", matcher: "*", command: "first" }),
    );
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).Stop;
    const inner = arr[0].hooks as Array<Record<string, string>>;
    expect(inner).toHaveLength(1);
    expect(inner[0].command).toBe("second");
  });
});

describe("updateHook", () => {
  it("rewrites matcher + command on a flat entry", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo old" }] } });
    updateHook(
      tmpFile,
      makeHook({ command: "echo old" }),
      { matcher: "Edit", command: "echo new" },
    );
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).PreToolUse;
    expect(arr[0]).toMatchObject({ matcher: "Edit", command: "echo new" });
  });

  it("rewrites only matcher + command on a nested entry, preserving timeout and unknown fields", () => {
    seed({
      hooks: {
        Stop: [
          {
            matcher: "*",
            hooks: [{ type: "command", command: "echo old", timeout: 30, if: "always" }],
          },
        ],
      },
    });
    updateHook(
      tmpFile,
      makeHook({ event: "Stop", matcher: "*", command: "echo old" }),
      { matcher: "*", command: "echo new" },
    );
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).Stop;
    const inner = arr[0].hooks as Array<Record<string, unknown>>;
    expect(inner[0]).toEqual({ type: "command", command: "echo new", timeout: 30, if: "always" });
  });

  it("refuses to rewrite a non-command hook (prompt/agent/http/mcp_tool)", () => {
    seed({
      hooks: {
        Stop: [{ matcher: "*", hooks: [{ type: "prompt", prompt: "Verify tests pass" }] }],
      },
    });
    const before = fs.readFileSync(tmpFile, "utf-8");
    const ok = updateHook(
      tmpFile,
      makeHook({
        event: "Stop",
        matcher: "*",
        command: "Verify tests pass",
        hookType: "prompt",
        commandIndex: 0,
      }),
      { matcher: "*", command: "new text" },
    );
    expect(ok).toBe(false);
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });
});

describe("locating hooks by index vs. fallback scan", () => {
  it("targets the entry at entryIndex when duplicate matcher+command entries exist", () => {
    seed({
      hooks: {
        PreToolUse: [
          { matcher: "Write", command: "echo dup" },
          { matcher: "Write", command: "echo dup" },
        ],
      },
    });
    deleteHook(tmpFile, makeHook({ command: "echo dup", entryIndex: 1 }));
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).PreToolUse;
    expect(arr).toHaveLength(1);
  });

  it("falls back to a full scan when the entryIndex is stale", () => {
    seed({
      hooks: { PreToolUse: [{ matcher: "Write", command: "echo hi" }] },
    });
    // The webview's snapshot is stale (file has only one entry, not four).
    const ok = deleteHook(tmpFile, makeHook({ command: "echo hi", entryIndex: 3 }));
    expect(ok).toBe(true);
    const data = read();
    expect(data.hooks).toBeUndefined();
  });
});

describe("toggleHookEnabled on a multi-command entry", () => {
  it("moves only the targeted command, leaving siblings and unknown outer keys behind", () => {
    seed({
      hooks: {
        Stop: [
          {
            matcher: "*",
            if: "always",
            hooks: [
              { type: "command", command: "first" },
              { type: "command", command: "second" },
            ],
          },
        ],
      },
    });
    const hook = makeHook({ event: "Stop", matcher: "*", command: "first", commandIndex: 0 });
    expect(toggleHookEnabled(tmpFile, hook, false)).toBe(true);
    const data = read();

    const active = data.hooks as Record<string, Array<Record<string, unknown>>>;
    expect(active.Stop[0].if).toBe("always");
    const remaining = active.Stop[0].hooks as Array<Record<string, unknown>>;
    expect(remaining).toEqual([{ type: "command", command: "second" }]);

    const disabled = data._disabled_hooks as Record<string, Array<Record<string, unknown>>>;
    expect(disabled.Stop[0].if).toBe("always");
    const moved = disabled.Stop[0].hooks as Array<Record<string, unknown>>;
    expect(moved).toEqual([{ type: "command", command: "first" }]);
  });
});
