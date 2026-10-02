import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: () => "/usr/bin/node\n",
}));

const fsState = new Map<string, string>();
/** Last-modified times; a file seeded without one reads as just written. */
const mtimes = new Map<string, number>();
/** Node binaries that exist and are executable on this "machine". */
const bins = new Set<string>();
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readFileSync: vi.fn((file: string) => {
      if (fsState.has(file)) return fsState.get(file) as string;
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }),
    accessSync: vi.fn((file: string) => {
      if (!bins.has(file)) throw new Error("ENOENT");
    }),
    writeFileSync: vi.fn((file: string, body: string) => {
      fsState.set(file, body);
    }),
    statSync: vi.fn((file: string) => {
      if (!fsState.has(file)) {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      return { mode: 0o644, mtimeMs: mtimes.get(file) ?? Date.now() };
    }),
    chmodSync: vi.fn(),
    copyFileSync: vi.fn((_src: string, dest: string) => {
      fsState.set(dest, "tap-bundle");
    }),
    mkdirSync: vi.fn(),
    renameSync: vi.fn((src: string, dest: string) => {
      if (fsState.has(src)) {
        fsState.set(dest, fsState.get(src) as string);
        fsState.delete(src);
      }
    }),
  };
});

vi.mock("../../../core/config", () => ({
  CLAUDE_MANAGER_DIR: "/home/.claude/.claude-manager",
  SESSION_TAP_FILE: "/home/.claude/.claude-manager/session-start-tap.js",
  SETTINGS_FILE: "/home/.claude/settings.json",
}));

import {
  ensureSessionStartHook,
  isSessionStartHookInstalled,
  removeSessionStartHook,
  sessionTapCommand,
} from "../sessionTapInstall";

const SETTINGS_FILE = "/home/.claude/settings.json";
const TAP_PATH = "/home/.claude/.claude-manager/session-start-tap.js";

beforeEach(() => {
  fsState.clear();
  mtimes.clear();
  bins.clear();
  bins.add("/usr/bin/node");
  vi.clearAllMocks();
});

const hookFile = (...commands: string[]): string =>
  JSON.stringify({
    model: "opus",
    hooks: {
      SessionStart: commands.map((command) => ({
        matcher: "",
        hooks: [{ type: "command", command }],
      })),
    },
  });

const sessionStartCommands = (): string[] =>
  (
    JSON.parse(fsState.get(SETTINGS_FILE) as string).hooks.SessionStart as {
      hooks: { command: string }[];
    }[]
  ).flatMap((e) => e.hooks.map((h) => h.command));

describe("sessionTapCommand", () => {
  it("interpolates an absolute node path", () => {
    expect(sessionTapCommand()).toBe(`"/usr/bin/node" "${TAP_PATH}"`);
  });
});

describe("ensureSessionStartHook", () => {
  it("adds a fresh SessionStart hook when settings.json is missing", () => {
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    expect(settings.hooks.SessionStart).toEqual([
      {
        matcher: "",
        hooks: [{ type: "command", command: `"/usr/bin/node" "${TAP_PATH}"` }],
      },
    ]);
  });

  it("preserves the user's other SessionStart hooks", () => {
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "", hooks: [{ type: "command", command: "echo user-hook" }] },
          ],
        },
      }),
    );
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    const ours = `"/usr/bin/node" "${TAP_PATH}"`;
    const commands = settings.hooks.SessionStart.flatMap(
      (e: { hooks: { command: string }[] }) => e.hooks.map((h) => h.command),
    );
    expect(commands).toContain("echo user-hook");
    expect(commands).toContain(ours);
  });

  it("is a no-op when the same entry already exists", () => {
    const expected = `"/usr/bin/node" "${TAP_PATH}"`;
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "", hooks: [{ type: "command", command: expected }] },
          ],
        },
      }),
    );
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: false });
  });

  it("REPLACES a foreign-machine copy of our tap instead of duplicating it (the cross-machine sync bug)", () => {
    // Windows entry that rode in via settings sync: same script basename,
    // different (non-existent-on-this-OS) home + node path. Claude Code
    // flags it as a broken command on startup.
    const foreign =
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\winuser\\.claude\\.claude-manager\\session-start-tap.js"';
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: "", hooks: [{ type: "command", command: foreign }] }],
        },
      }),
    );
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    const commands = settings.hooks.SessionStart.flatMap(
      (e: { hooks: { command: string }[] }) => e.hooks.map((h) => h.command),
    );
    // Foreign command gone, exactly one current-machine command — no dup.
    expect(commands).toEqual([`"/usr/bin/node" "${TAP_PATH}"`]);
    expect(commands).not.toContain(foreign);
  });

  it("keeps a working entry whose node differs from this shell's (fnm/nvm churn)", () => {
    // A window launched from another shell baked another — still valid —
    // node. Rewriting it on every activation churned settings.json.
    const other = `"/opt/fnm/node-versions/v20/bin/node" "${TAP_PATH}"`;
    bins.add("/opt/fnm/node-versions/v20/bin/node");
    const before = hookFile(other);
    fsState.set(SETTINGS_FILE, before);
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: false });
    expect(fsState.get(SETTINGS_FILE)).toBe(before);
  });

  it("rewrites an entry whose baked node binary is gone", () => {
    // fnm cleaned its multishell dir / nvm uninstalled the version.
    fsState.set(SETTINGS_FILE, hookFile(`"/tmp/fnm_multishells/1_2/bin/node" "${TAP_PATH}"`));
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    expect(sessionStartCommands()).toEqual([`"/usr/bin/node" "${TAP_PATH}"`]);
  });

  it("rewrites a bare-node entry once an absolute node can be resolved", () => {
    // Installed while node was missing from VS Code's PATH; left bare it
    // depends on Claude Code's shell having node on PATH too.
    fsState.set(SETTINGS_FILE, hookFile(`"node" "${TAP_PATH}"`));
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    expect(sessionStartCommands()).toEqual([`"/usr/bin/node" "${TAP_PATH}"`]);
  });

  it("collapses duplicate working entries to one", () => {
    const ours = `"/usr/bin/node" "${TAP_PATH}"`;
    fsState.set(SETTINGS_FILE, hookFile(ours, ours));
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    expect(sessionStartCommands()).toEqual([ours]);
  });

  it("strips a stale copy sharing an entry with a user hook, even beside a working one", () => {
    const ours = `"/usr/bin/node" "${TAP_PATH}"`;
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "", hooks: [{ type: "command", command: ours }] },
            {
              matcher: "",
              hooks: [
                { type: "command", command: "echo user-hook" },
                { type: "command", command: '"/gone/node" "/x/session-start-tap.js"' },
              ],
            },
          ],
        },
      }),
    );
    expect(ensureSessionStartHook("/ext/dist")).toEqual({ ok: true, changed: true });
    expect(sessionStartCommands()).toEqual([ours, "echo user-hook"]);
  });

  it("leaves non-tap user hooks (e.g. a foreign precompact) untouched", () => {
    const userPrecompact = 'bash "C:/Users/winuser/.claude/hooks/csm-precompact.sh"';
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          PreCompact: [{ matcher: "", hooks: [{ type: "command", command: userPrecompact }] }],
        },
      }),
    );
    ensureSessionStartHook("/ext/dist");
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    // We only manage SessionStart; the user's PreCompact hook is not ours
    // to remove, even when it's a broken foreign path.
    expect(settings.hooks.PreCompact[0].hooks[0].command).toBe(userPrecompact);
  });
});

describe("removeSessionStartHook", () => {
  it("removes our hook and preserves siblings", () => {
    const ours = `"/usr/bin/node" "${TAP_PATH}"`;
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [
                { type: "command", command: "echo user-hook" },
                { type: "command", command: ours },
              ],
            },
          ],
        },
      }),
    );
    expect(removeSessionStartHook()).toEqual({ ok: true, changed: true });
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    const remaining = settings.hooks.SessionStart[0].hooks.map(
      (h: { command: string }) => h.command,
    );
    expect(remaining).toEqual(["echo user-hook"]);
  });

  it("returns false when there is nothing to remove", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ hooks: {} }));
    expect(removeSessionStartHook()).toEqual({ ok: true, changed: false });
  });

  it("deletes the SessionStart key entirely when only our hook was wired", () => {
    const ours = `"/usr/bin/node" "${TAP_PATH}"`;
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "", hooks: [{ type: "command", command: ours }] },
          ],
        },
      }),
    );
    expect(removeSessionStartHook()).toEqual({ ok: true, changed: true });
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    expect(settings.hooks.SessionStart).toBeUndefined();
  });
});

describe("never rewrites a settings.json it cannot read", () => {
  /**
   * ensureSessionStartHook runs on EVERY activation with no opt-in, and
   * readSettings used to answer a parse failure with `{}` so the caller
   * "wrote it back fresh" — replacing the user's whole settings.json
   * with just our hook. Claude Code already refuses to load a file with
   * comments or a trailing comma, so a user mid-debug of exactly that
   * lost the file by opening the editor.
   */
  const HOSTILE: Array<[string, string]> = [
    ["a JSON comment", '{\n // note\n "model": "opus"\n}'],
    ["a trailing comma", '{ "model": "opus", }'],
    ["truncation", '{ "model": "opus", "hooks": {'],
    ["a top-level array", '["nope"]'],
  ];

  it.each(HOSTILE)("leaves it byte-identical: %s", (_label, content) => {
    fsState.set(SETTINGS_FILE, content);
    expect(ensureSessionStartHook("/dist")).toMatchObject({ ok: false });
    expect(fsState.get(SETTINGS_FILE)).toBe(content);
  });

  it("also refuses on removal", () => {
    const content = '{ "hooks": { "SessionStart": [] }, }';
    fsState.set(SETTINGS_FILE, content);
    expect(removeSessionStartHook()).toMatchObject({ ok: false });
    expect(fsState.get(SETTINGS_FILE)).toBe(content);
  });

  it("still installs into an absent file", () => {
    fsState.delete(SETTINGS_FILE);
    expect(ensureSessionStartHook("/dist")).toEqual({ ok: true, changed: true });
    expect(JSON.parse(fsState.get(SETTINGS_FILE) as string).hooks.SessionStart).toBeTruthy();
  });

  it.each(["", "  \n"])(
    "refuses a freshly emptied file — Claude Code may be mid-rewrite (%j)",
    (content) => {
      // Writing here produced a settings.json holding only our hook,
      // wiping permissions, env, hooks and plugin/MCP approvals.
      fsState.set(SETTINGS_FILE, content);
      expect(ensureSessionStartHook("/dist")).toMatchObject({ ok: false, reason: "mid-write" });
      expect(removeSessionStartHook()).toMatchObject({ ok: false, reason: "mid-write" });
      expect(fsState.get(SETTINGS_FILE)).toBe(content);
    },
  );

  it("installs into a file that has stayed empty past the settle window", () => {
    fsState.set(SETTINGS_FILE, "");
    mtimes.set(SETTINGS_FILE, Date.now() - 60_000);
    expect(ensureSessionStartHook("/dist")).toEqual({ ok: true, changed: true });
    expect(sessionStartCommands()).toEqual([sessionTapCommand()]);
  });

  it("names the file and the reason for an invalid one", () => {
    fsState.set(SETTINGS_FILE, '{ "model": "opus", }');
    expect(ensureSessionStartHook("/dist")).toEqual({
      ok: false,
      reason: "invalid-json",
      error: `${SETTINGS_FILE} isn't valid JSON, so it was left untouched. Fix or remove it, then try again`,
    });
  });

  it("refuses when the read fails for any reason but ENOENT", async () => {
    const fs = await import("fs");
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      const err = new Error("EACCES") as NodeJS.ErrnoException;
      err.code = "EACCES";
      throw err;
    });
    expect(ensureSessionStartHook("/dist")).toMatchObject({ ok: false, reason: "unreadable" });
    expect(fsState.has(SETTINGS_FILE)).toBe(false);
  });

  it("says the script copy failed, and leaves settings.json alone", async () => {
    const fs = await import("fs");
    vi.mocked(fs.copyFileSync).mockImplementationOnce(() => {
      throw new Error("ENOSPC: no space left on device");
    });
    expect(ensureSessionStartHook("/dist")).toEqual({
      ok: false,
      reason: "copy-failed",
      error: `the hook script couldn't be copied to ${TAP_PATH} (ENOSPC: no space left on device)`,
    });
    expect(fsState.has(SETTINGS_FILE)).toBe(false);
  });

  it("preserves every unrelated key on a valid file", () => {
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({ model: "opus", env: { A: "1" }, permissions: { allow: ["Bash(ls)"] } }),
    );
    expect(ensureSessionStartHook("/dist")).toEqual({ ok: true, changed: true });
    const after = JSON.parse(fsState.get(SETTINGS_FILE) as string) as Record<string, unknown>;
    expect(after.model).toBe("opus");
    expect(after.env).toEqual({ A: "1" });
    expect(after.permissions).toEqual({ allow: ["Bash(ls)"] });
  });
});

describe("isSessionStartHookInstalled", () => {
  it("is false for an absent, blank or hook-free settings.json", () => {
    expect(isSessionStartHookInstalled()).toBe(false);
    fsState.set(SETTINGS_FILE, "  ");
    expect(isSessionStartHookInstalled()).toBe(false);
    fsState.set(SETTINGS_FILE, JSON.stringify({ model: "opus" }));
    expect(isSessionStartHookInstalled()).toBe(false);
  });

  it("is true once the hook is installed", () => {
    ensureSessionStartHook("/dist");
    expect(isSessionStartHookInstalled()).toBe(true);
  });

  it("is false again after removal", () => {
    ensureSessionStartHook("/dist");
    removeSessionStartHook();
    expect(isSessionStartHookInstalled()).toBe(false);
  });

  it("recognises another machine's copy of the hook", () => {
    // Settings sync carries a foreign node/home path; the basename is
    // what identifies the entry as ours, here and in the installer.
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "",
              hooks: [
                { type: "command", command: '"/opt/node" "/other/session-start-tap.js"' },
              ],
            },
          ],
        },
      }),
    );
    expect(isSessionStartHookInstalled()).toBe(true);
  });

  it("ignores somebody else's SessionStart hooks", () => {
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [
            { matcher: "", hooks: [{ type: "command", command: "echo hi" }] },
          ],
        },
      }),
    );
    expect(isSessionStartHookInstalled()).toBe(false);
  });

  it("is false when settings.json cannot be parsed", () => {
    // The caller cannot write to that file either, so "not installed"
    // is the answer that keeps every path read-only.
    fsState.set(SETTINGS_FILE, '{ "hooks": { "SessionStart": [] }, }');
    expect(isSessionStartHookInstalled()).toBe(false);
  });
});
