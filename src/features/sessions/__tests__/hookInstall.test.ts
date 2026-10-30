/**
 * The shared hook mechanics for more than one event at once. The
 * single-event behaviour (stale copies, foreign machines, unreadable
 * settings) is pinned through its first user in sessionTapInstall.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: () => "/usr/bin/node\n",
}));

const fsState = new Map<string, string>();
const writes: string[] = [];
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  const missing = (): never => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  };
  return {
    ...actual,
    readFileSync: vi.fn((file: string) => (fsState.has(file) ? fsState.get(file) : missing())),
    accessSync: vi.fn((file: string) => {
      if (file !== "/usr/bin/node") throw new Error("ENOENT");
    }),
    writeFileSync: vi.fn((file: string, body: string) => {
      fsState.set(file, body);
    }),
    statSync: vi.fn((file: string) =>
      fsState.has(file) ? { mode: 0o644, mtimeMs: 0 } : missing(),
    ),
    chmodSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn((src: string, dest: string) => {
      writes.push(dest);
      fsState.set(dest, fsState.get(src) as string);
      fsState.delete(src);
    }),
  };
});

vi.mock("../../../core/config", () => ({
  CLAUDE_MANAGER_DIR: "/home/.claude/.claude-manager",
  SETTINGS_FILE: "/home/.claude/settings.json",
}));

import { ensureHooks, isHookInstalled, removeHooks, type HookSpec } from "../hookInstall";

const SETTINGS_FILE = "/home/.claude/settings.json";
const SCRIPT = "/home/.claude/.claude-manager/session-rename-tap.js";
const SPECS: HookSpec[] = [
  { event: "SessionStart", scriptFile: SCRIPT },
  { event: "UserPromptSubmit", scriptFile: SCRIPT },
];
const OURS = `"/usr/bin/node" "${SCRIPT}"`;
const userHook = { matcher: "", hooks: [{ type: "command", command: "echo mine" }] };

const settings = (): { hooks?: Record<string, unknown[]>; model?: string } =>
  JSON.parse(fsState.get(SETTINGS_FILE) as string);

beforeEach(() => {
  fsState.clear();
  writes.length = 0;
});

describe("ensureHooks", () => {
  it("adds every event in a single write", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ model: "opus" }));
    expect(ensureHooks(SPECS)).toEqual({ ok: true, changed: true });
    expect(writes).toEqual([SETTINGS_FILE]);
    const { hooks, model } = settings();
    expect(model).toBe("opus");
    for (const event of ["SessionStart", "UserPromptSubmit"]) {
      expect(hooks?.[event]).toEqual([{ matcher: "", hooks: [{ type: "command", command: OURS }] }]);
    }
  });

  it("keeps the user's hooks on those events", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ hooks: { UserPromptSubmit: [userHook] } }));
    ensureHooks(SPECS);
    expect(settings().hooks?.UserPromptSubmit).toEqual([
      userHook,
      { matcher: "", hooks: [{ type: "command", command: OURS }] },
    ]);
  });

  it("does not rewrite settings that already say the right thing", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({}));
    ensureHooks(SPECS);
    writes.length = 0;
    expect(ensureHooks(SPECS)).toEqual({ ok: true, changed: false });
    expect(writes).toEqual([]);
  });

  it("adds only the event that is missing", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({}));
    ensureHooks([SPECS[0]]);
    ensureHooks(SPECS);
    expect(settings().hooks?.SessionStart).toHaveLength(1);
    expect(settings().hooks?.UserPromptSubmit).toHaveLength(1);
  });
});

describe("removeHooks", () => {
  it("removes ours from every event, keeping the user's", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ hooks: { UserPromptSubmit: [userHook] } }));
    ensureHooks(SPECS);
    expect(removeHooks(SPECS)).toEqual({ ok: true, changed: true });
    expect(settings().hooks).toEqual({ UserPromptSubmit: [userHook] });
  });

  it("reports no change when none of ours is there", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({ hooks: { UserPromptSubmit: [userHook] } }));
    expect(removeHooks(SPECS)).toEqual({ ok: true, changed: false });
    expect(writes).toEqual([]);
  });
});

describe("isHookInstalled", () => {
  it("answers per event", () => {
    fsState.set(SETTINGS_FILE, JSON.stringify({}));
    ensureHooks([SPECS[1]]);
    expect(isHookInstalled(SPECS[1])).toBe(true);
    expect(isHookInstalled(SPECS[0])).toBe(false);
  });

  it("does not take another script's hook for ours", () => {
    fsState.set(
      SETTINGS_FILE,
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: '"node" "/x/session-start-tap.js"' }] }],
        },
      }),
    );
    expect(isHookInstalled(SPECS[0])).toBe(false);
  });
});
