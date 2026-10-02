import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { toggleHookEnabled, deleteHook, updateHook, moveHookToFile, addHook } from "../writer";
import type { Hook } from "../types";

let tmpFile: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-hooks-"));
  tmpFile = path.join(tmpDir, "settings.json");
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

  it("rejects an empty command without touching the file", () => {
    expect(addHook(tmpFile, "PreToolUse", "Write", "  ")).toEqual({
      ok: false,
      error: "A hook needs both an event and a command",
    });
    expect(fs.existsSync(tmpFile)).toBe(false);
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
    expect(ok).toMatchObject({ ok: false });
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });

  it("deleteHook refuses to mutate plugin-sourced hooks", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "echo" }] } });
    const before = fs.readFileSync(tmpFile, "utf-8");
    expect(deleteHook(tmpFile, makeHook({ scope: "plugin", pluginName: "p@mkt" }))).toMatchObject({ ok: false });
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
    expect(ok).toMatchObject({ ok: false });
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
    expect(toggleHookEnabled(tmpFile, hook, false)).toEqual({ ok: true });
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
    expect(toggleHookEnabled(tmpFile, hook, true)).toEqual({ ok: true });
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

  it("rewrites matcher/command in place, preserving unknown fields and re-applying timeout", () => {
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
    // The edit form always sends the current timeout back, so a same-event
    // edit preserves it; unknown fields (`if`) survive the in-place mutation.
    updateHook(
      tmpFile,
      makeHook({ event: "Stop", matcher: "*", command: "echo old" }),
      { matcher: "*", command: "echo new", timeout: 30 },
    );
    const data = read();
    const arr = (data.hooks as Record<string, Array<Record<string, unknown>>>).Stop;
    const inner = arr[0].hooks as Array<Record<string, unknown>>;
    expect(inner[0]).toEqual({ type: "command", command: "echo new", timeout: 30, if: "always" });
  });

  it("removes the timeout when the edit omits it", () => {
    seed({
      hooks: {
        Stop: [{ matcher: "*", hooks: [{ type: "command", command: "c", timeout: 30 }] }],
      },
    });
    updateHook(
      tmpFile,
      makeHook({ event: "Stop", matcher: "*", command: "c" }),
      { matcher: "*", command: "c" },
    );
    const inner = (read().hooks as Record<string, Array<Record<string, unknown>>>).Stop[0]
      .hooks as Array<Record<string, unknown>>;
    expect("timeout" in inner[0]).toBe(false);
  });

  it("re-homes a hook to a new event within the same file, carrying command + timeout", () => {
    seed({
      hooks: {
        PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "c", timeout: 15 }] }],
      },
    });
    const ok = updateHook(
      tmpFile,
      makeHook({ event: "PreToolUse", matcher: "Write", command: "c", commandIndex: 0 }),
      { matcher: "Edit", command: "c2", event: "PostToolUse", timeout: 15 },
    );
    expect(ok).toEqual({ ok: true });
    const data = read().hooks as Record<string, Array<Record<string, unknown>>>;
    expect(data.PreToolUse).toBeUndefined(); // old event array dropped
    const moved = data.PostToolUse[0].hooks as Array<Record<string, unknown>>;
    expect(data.PostToolUse[0].matcher).toBe("Edit");
    expect(moved[0]).toEqual({ type: "command", command: "c2", timeout: 15 });
  });

  it("re-homes a hook to a new event keeping `if`, `async`, `statusMessage` and unknown keys", () => {
    const original = {
      type: "command",
      command: "c",
      timeout: 15,
      if: "Bash(git *)",
      async: true,
      statusMessage: "Checking…",
      futureKey: { nested: 1 },
    };
    seed({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [original] }] } });
    updateHook(
      tmpFile,
      makeHook({ event: "PreToolUse", matcher: "Bash", command: "c", commandIndex: 0 }),
      { matcher: "Bash", command: "c2", event: "PostToolUse" },
    );
    const data = read().hooks as Record<string, Array<Record<string, unknown>>>;
    const { timeout: _dropped, ...rest } = original;
    expect(data.PostToolUse[0].hooks).toEqual([{ ...rest, command: "c2" }]);
  });

  it("re-homes a flat entry as a typed nested record without its group matcher", () => {
    seed({ hooks: { PreToolUse: [{ matcher: "Write", command: "c", statusMessage: "s" }] } });
    updateHook(tmpFile, makeHook({ command: "c" }), { matcher: "Edit", command: "c", event: "PostToolUse" });
    const data = read().hooks as Record<string, Array<Record<string, unknown>>>;
    expect(data.PostToolUse).toEqual([
      { matcher: "Edit", hooks: [{ type: "command", command: "c", statusMessage: "s" }] },
    ]);
  });

  describe("same-event matcher change in a multi-command group", () => {
    const group = (): Record<string, unknown> => ({
      matcher: "Bash",
      note: "group key",
      hooks: [
        { type: "command", command: "a" },
        { type: "command", command: "b", if: "Bash(rm *)" },
      ],
    });

    it("moves only the edited command into a new group, leaving its sibling matched as before", () => {
      seed({ hooks: { PreToolUse: [group()] } });
      const ok = updateHook(
        tmpFile,
        makeHook({ matcher: "Bash", command: "b", commandIndex: 1 }),
        { matcher: "Write", command: "b" },
      );
      expect(ok).toEqual({ ok: true });
      expect((read().hooks as Record<string, unknown>).PreToolUse).toEqual([
        { matcher: "Bash", note: "group key", hooks: [{ type: "command", command: "a" }] },
        { matcher: "Write", note: "group key", hooks: [{ type: "command", command: "b", if: "Bash(rm *)" }] },
      ]);
    });

    it("joins an existing group that already uses the new matcher", () => {
      seed({
        hooks: {
          PreToolUse: [group(), { matcher: "Write", hooks: [{ type: "command", command: "w" }] }],
        },
      });
      updateHook(tmpFile, makeHook({ matcher: "Bash", command: "a", commandIndex: 0 }), {
        matcher: "Write",
        command: "a2",
      });
      expect((read().hooks as Record<string, unknown>).PreToolUse).toEqual([
        { matcher: "Bash", note: "group key", hooks: [{ type: "command", command: "b", if: "Bash(rm *)" }] },
        {
          matcher: "Write",
          hooks: [
            { type: "command", command: "w" },
            { type: "command", command: "a2" },
          ],
        },
      ]);
    });

    it("drops the old group once its last command moves to an existing group", () => {
      seed({
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "a" }] },
            { matcher: "Write", hooks: [{ type: "command", command: "w" }] },
          ],
        },
      });
      updateHook(tmpFile, makeHook({ matcher: "Bash", command: "a", commandIndex: 0 }), {
        matcher: "Write",
        command: "a",
      });
      expect((read().hooks as Record<string, unknown>).PreToolUse).toEqual([
        {
          matcher: "Write",
          hooks: [
            { type: "command", command: "w" },
            { type: "command", command: "a" },
          ],
        },
      ]);
    });

    it("re-matches a sole-command group in place when no group uses the new matcher", () => {
      seed({ hooks: { PreToolUse: [{ matcher: "Bash", note: "k", hooks: [{ type: "command", command: "a" }] }] } });
      updateHook(tmpFile, makeHook({ matcher: "Bash", command: "a", commandIndex: 0 }), {
        matcher: "Write",
        command: "a",
      });
      expect((read().hooks as Record<string, unknown>).PreToolUse).toEqual([
        { matcher: "Write", note: "k", hooks: [{ type: "command", command: "a" }] },
      ]);
    });
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
    expect(ok).toMatchObject({ ok: false });
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(before);
  });
});

describe("moveHookToFile (cross-scope)", () => {
  it("adds to the destination and removes from the source, preserving command + timeout", () => {
    const toFile = path.join(tmpDir, "settings.local.json");
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "c", timeout: 20 }] }] },
      }),
    );
    const ok = moveHookToFile(
      tmpFile,
      toFile,
      makeHook({ event: "PreToolUse", matcher: "Write", command: "c", commandIndex: 0 }),
      { matcher: "Write", command: "c", timeout: 20 },
    );
    expect(ok).toEqual({ ok: true });
    // Source emptied.
    expect(JSON.parse(fs.readFileSync(tmpFile, "utf-8")).hooks).toBeUndefined();
    // Destination has the moved hook.
    const dest = JSON.parse(fs.readFileSync(toFile, "utf-8")).hooks.PreToolUse[0];
    expect(dest.matcher).toBe("Write");
    expect(dest.hooks[0]).toEqual({ type: "command", command: "c", timeout: 20 });
  });

  it("carries the full original record into the destination file", () => {
    const toFile = path.join(tmpDir, "settings.local.json");
    seed({
      hooks: {
        Stop: [{ matcher: "", hooks: [{ type: "command", command: "c", async: true, statusMessage: "s", x: 1 }] }],
      },
    });
    moveHookToFile(tmpFile, toFile, makeHook({ event: "Stop", matcher: "", command: "c", commandIndex: 0 }), {
      matcher: "",
      command: "c",
      timeout: 5,
    });
    const dest = JSON.parse(fs.readFileSync(toFile, "utf-8")).hooks.Stop[0];
    expect(dest.hooks[0]).toEqual({ type: "command", command: "c", async: true, statusMessage: "s", x: 1, timeout: 5 });
  });

  it("refuses a non-command hook", () => {
    const toFile = path.join(tmpDir, "settings.local.json");
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ hooks: { Stop: [{ matcher: "*", hooks: [{ type: "prompt", prompt: "p" }] }] } }),
    );
    const ok = moveHookToFile(
      tmpFile,
      toFile,
      makeHook({ event: "Stop", matcher: "*", command: "p", hookType: "prompt", commandIndex: 0 }),
      { matcher: "*", command: "p" },
    );
    expect(ok).toMatchObject({ ok: false });
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
    expect(ok).toEqual({ ok: true });
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
    expect(toggleHookEnabled(tmpFile, hook, false)).toEqual({ ok: true });
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

describe("never rewrites a settings.json it cannot parse", () => {
  /**
   * Every writer here read the file "tolerating" a parse error by
   * starting from `{}`, then wrote that back — so toggling one hook
   * replaced a settings.json carrying a comment or a trailing comma with
   * nothing but that hook. Claude Code already refuses to load a file in
   * that state, so the user may well be mid-repair when they click.
   */
  const HOSTILE: Array<[string, string]> = [
    ["a JSON comment", '{\n  // note\n  "model": "opus",\n  "hooks": {}\n}'],
    ["a trailing comma", '{ "model": "opus", "hooks": {}, }'],
    ["truncation", '{ "model": "opus", "hooks": {'],
    ["a top-level array", '["nope"]'],
  ];

  it.each(HOSTILE)("addHook refuses and leaves it byte-identical: %s", (_l, content) => {
    fs.writeFileSync(tmpFile, content);
    expect(
      addHook(tmpFile, "PreToolUse", "Write", "echo hi"),
    ).toMatchObject({ ok: false });
    expect(fs.readFileSync(tmpFile, "utf-8")).toBe(content);
  });

  it("toggle, delete and update refuse too", () => {
    const content = '{ "hooks": { "PreToolUse": [] }, }';
    const hook = makeHook();
    for (const op of [
      () => toggleHookEnabled(tmpFile, hook, true),
      () => deleteHook(tmpFile, hook),
      () => updateHook(tmpFile, hook, { event: "PreToolUse", matcher: "Read", command: "x" }),
    ]) {
      fs.writeFileSync(tmpFile, content);
      expect(op()).toMatchObject({ ok: false });
      expect(fs.readFileSync(tmpFile, "utf-8")).toBe(content);
    }
  });

  it.each(["", " \n"])(
    "refuses a freshly emptied file — Claude Code may be mid-rewrite (%j)",
    (content) => {
      fs.writeFileSync(tmpFile, content);
      expect(addHook(tmpFile, "PreToolUse", "Write", "echo hi")).toEqual({
        ok: false,
        error: `${tmpFile} is being written by Claude Code right now, so it was left untouched. Try again in a moment`,
      });
      expect(fs.readFileSync(tmpFile, "utf-8")).toBe(content);
    },
  );

  it("writes into an empty file that has stayed empty past the settle window", () => {
    // `touch settings.json`: refusing it forever would block every write.
    fs.writeFileSync(tmpFile, "");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(tmpFile, old, old);
    expect(addHook(tmpFile, "PreToolUse", "Write", "echo hi")).toEqual({ ok: true });
    expect(read().hooks).toBeTruthy();
  });

  it("says why a hostile file was refused", () => {
    fs.writeFileSync(tmpFile, '{ "hooks": {}, }');
    expect(addHook(tmpFile, "PreToolUse", "Write", "echo hi")).toEqual({
      ok: false,
      error: `${tmpFile} isn't valid JSON, so it was left untouched. Fix or remove it, then try again`,
    });
  });

  it("refuses a path it cannot read (not ENOENT)", () => {
    // A directory where the file should be: EISDIR, standing in for
    // EACCES / EBUSY — the file exists, we just could not see it.
    fs.mkdirSync(tmpFile);
    expect(addHook(tmpFile, "PreToolUse", "Write", "echo hi")).toMatchObject({ ok: false });
    expect(fs.statSync(tmpFile).isDirectory()).toBe(true);
  });

  it("still writes into an absent file, and keeps unrelated keys", () => {
    expect(
      addHook(tmpFile, "PreToolUse", "Write", "echo hi"),
    ).toEqual({ ok: true });
    expect(read().hooks).toBeTruthy();

    seed({ model: "opus", env: { A: "1" } });
    expect(
      addHook(tmpFile, "Stop", "", "echo bye"),
    ).toEqual({ ok: true });
    const after = read();
    expect(after.model).toBe("opus");
    expect(after.env).toEqual({ A: "1" });
  });
});

describe("refusal reasons", () => {
  it("says the hook moved when the file no longer holds it", () => {
    seed({ hooks: {} });
    expect(deleteHook(tmpFile, makeHook())).toEqual({
      ok: false,
      error: `The hook is no longer in ${tmpFile} — it may have been edited on disk`,
    });
  });

  it("says why a non-command hook can't be edited", () => {
    const result = updateHook(tmpFile, makeHook({ hookType: "prompt" }), { matcher: "", command: "x" });
    expect(result).toEqual({
      ok: false,
      error: "Only command hooks can be edited; other hook types support toggle and delete",
    });
  });
});
