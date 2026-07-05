import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: () => "/usr/bin/node\n",
}));

const fsState = new Map<string, string>();
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
    writeFileSync: vi.fn((file: string, body: string) => {
      fsState.set(file, body);
    }),
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
  removeSessionStartHook,
  sessionTapCommand,
} from "../sessionTapInstall";

const SETTINGS_FILE = "/home/.claude/settings.json";
const TAP_PATH = "/home/.claude/.claude-manager/session-start-tap.js";

beforeEach(() => {
  fsState.clear();
  vi.clearAllMocks();
});

describe("sessionTapCommand", () => {
  it("interpolates an absolute node path", () => {
    expect(sessionTapCommand()).toBe(`"/usr/bin/node" "${TAP_PATH}"`);
  });
});

describe("ensureSessionStartHook", () => {
  it("adds a fresh SessionStart hook when settings.json is missing", () => {
    expect(ensureSessionStartHook("/ext/dist")).toBe(true);
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
    expect(ensureSessionStartHook("/ext/dist")).toBe(true);
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
    expect(ensureSessionStartHook("/ext/dist")).toBe(false);
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
    expect(ensureSessionStartHook("/ext/dist")).toBe(true);
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    const commands = settings.hooks.SessionStart.flatMap(
      (e: { hooks: { command: string }[] }) => e.hooks.map((h) => h.command),
    );
    // Foreign command gone, exactly one current-machine command — no dup.
    expect(commands).toEqual([`"/usr/bin/node" "${TAP_PATH}"`]);
    expect(commands).not.toContain(foreign);
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
    expect(removeSessionStartHook()).toBe(true);
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    const remaining = settings.hooks.SessionStart[0].hooks.map(
      (h: { command: string }) => h.command,
    );
    expect(remaining).toEqual(["echo user-hook"]);
  });

  it("returns false when there is nothing to remove", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ hooks: {} }));
    expect(removeSessionStartHook()).toBe(false);
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
    expect(removeSessionStartHook()).toBe(true);
    const settings = JSON.parse(fsState.get(SETTINGS_FILE) as string);
    expect(settings.hooks.SessionStart).toBeUndefined();
  });
});
