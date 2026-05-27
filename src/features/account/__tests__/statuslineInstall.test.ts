import { beforeEach, describe, expect, it, vi } from "vitest";

/** In-memory filesystem the mocks operate on. */
const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  removed: [] as string[],
}));

vi.mock("fs", () => ({
  mkdirSync: () => undefined,
  copyFileSync: (_src: string, dst: string): void => {
    fsState.files.set(String(dst), "TAP-CONTENT");
  },
  readFileSync: (p: string): string => {
    const v = fsState.files.get(String(p));
    if (v === undefined) {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return v;
  },
  writeFileSync: (p: string, data: string): void => {
    fsState.files.set(String(p), String(data));
  },
  rmSync: (p: string): void => {
    if (!fsState.files.has(String(p))) {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    fsState.files.delete(String(p));
    fsState.removed.push(String(p));
  },
}));

/** Record writeSettingsValue calls instead of touching a real settings file. */
const settings = vi.hoisted(() => ({ calls: [] as Array<{ key: string; value: unknown }> }));
vi.mock("../parser", () => ({
  writeSettingsValue: (key: string, value: unknown): boolean => {
    settings.calls.push({ key, value });
    return true;
  },
}));

import {
  SETTINGS_FILE,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
  STATUSLINE_TAP_FILE,
} from "../../../core/config";
import { installStatusline, isStatuslineInstalled, uninstallStatusline } from "../statuslineInstall";

const TAP_COMMAND = `node "${STATUSLINE_TAP_FILE}"`;

function seedSettings(command: string): void {
  fsState.files.set(SETTINGS_FILE, JSON.stringify({ statusLine: { command } }));
}

beforeEach(() => {
  fsState.files.clear();
  fsState.removed = [];
  settings.calls = [];
});

describe("isStatuslineInstalled", () => {
  it("is true when statusLine.command points at the tap", () => {
    seedSettings(TAP_COMMAND);
    expect(isStatuslineInstalled()).toBe(true);
  });

  it("is false for a different command", () => {
    seedSettings("my-bar.sh");
    expect(isStatuslineInstalled()).toBe(false);
  });

  it("is false when there is no settings file", () => {
    expect(isStatuslineInstalled()).toBe(false);
  });
});

describe("installStatusline", () => {
  it("copies the tap, records the prior command, and rewires the setting", () => {
    seedSettings("my-bar.sh");
    const res = installStatusline("/dist/statusline-tap.js");
    expect(res.ok).toBe(true);
    expect(fsState.files.get(STATUSLINE_TAP_FILE)).toBe("TAP-CONTENT");
    expect(JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!)).toEqual({ command: "my-bar.sh" });
    expect(settings.calls).toContainEqual({ key: "statusLine.command", value: TAP_COMMAND });
  });

  it("records an empty inner command when the user had no statusline", () => {
    installStatusline("/dist/statusline-tap.js");
    expect(JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!)).toEqual({ command: "" });
  });

  it("does not overwrite the recorded original on re-install", () => {
    seedSettings(TAP_COMMAND); // already ours
    fsState.files.set(STATUSLINE_INNER_FILE, JSON.stringify({ command: "orig-bar.sh" }));
    installStatusline("/dist/statusline-tap.js");
    expect(JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!)).toEqual({ command: "orig-bar.sh" });
  });
});

describe("uninstallStatusline", () => {
  it("restores the original command and removes our files", () => {
    fsState.files.set(STATUSLINE_INNER_FILE, JSON.stringify({ command: "orig-bar.sh" }));
    fsState.files.set(STATUSLINE_TAP_FILE, "TAP-CONTENT");
    fsState.files.set(STATUSLINE_CACHE_FILE, "{}");

    const res = uninstallStatusline();
    expect(res.ok).toBe(true);
    expect(settings.calls).toContainEqual({ key: "statusLine.command", value: "orig-bar.sh" });
    expect(fsState.removed).toEqual(
      expect.arrayContaining([STATUSLINE_INNER_FILE, STATUSLINE_TAP_FILE, STATUSLINE_CACHE_FILE]),
    );
  });

  it("restores an empty command (deletes the key) when none was recorded", () => {
    uninstallStatusline();
    expect(settings.calls).toContainEqual({ key: "statusLine.command", value: "" });
  });
});
