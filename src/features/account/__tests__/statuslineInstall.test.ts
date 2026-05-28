import * as path from "path";
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

/** Record writeSettingsValue calls — capture scope + workspace to assert routing. */
const settings = vi.hoisted(() => ({
  calls: [] as Array<{
    key: string;
    value: unknown;
    scope?: string;
    workspacePath?: string;
  }>,
}));
vi.mock("../parser", () => ({
  writeSettingsValue: (
    key: string,
    value: unknown,
    scope?: string,
    workspacePath?: string,
  ): boolean => {
    settings.calls.push({ key, value, scope, workspacePath });
    return true;
  },
}));

/** Deterministic node-path resolution so the installed command is stable. */
vi.mock("child_process", () => ({
  execFileSync: (): string => "/usr/bin/node\n",
}));

import {
  SETTINGS_FILE,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
  STATUSLINE_TAP_FILE,
} from "../../../core/config";
import {
  installStatusline,
  isStatuslineInstalled,
  resolveEffectiveScope,
  uninstallStatusline,
} from "../statuslineInstall";

const TAP_COMMAND = `"/usr/bin/node" "${STATUSLINE_TAP_FILE}"`;
const WS = "/fake-ws";
const PROJECT_SETTINGS = path.join(WS, ".claude", "settings.json");
const LOCAL_SETTINGS = path.join(WS, ".claude", "settings.local.json");

function seedSettingsAt(filePath: string, command: string | null): void {
  if (command === null) {
    fsState.files.set(filePath, JSON.stringify({}));
  } else {
    fsState.files.set(filePath, JSON.stringify({ statusLine: { command } }));
  }
}

beforeEach(() => {
  fsState.files.clear();
  fsState.removed = [];
  settings.calls = [];
});

describe("resolveEffectiveScope", () => {
  it("falls back to global with '' when nothing defines statusLine", () => {
    expect(resolveEffectiveScope()).toEqual({ scope: "global", command: "" });
  });

  it("picks global when only global is defined", () => {
    seedSettingsAt(SETTINGS_FILE, "global-bar");
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "global", command: "global-bar" });
  });

  it("project overrides global", () => {
    seedSettingsAt(SETTINGS_FILE, "global-bar");
    seedSettingsAt(PROJECT_SETTINGS, "project-bar");
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "project", command: "project-bar" });
  });

  it("local overrides project + global", () => {
    seedSettingsAt(SETTINGS_FILE, "global-bar");
    seedSettingsAt(PROJECT_SETTINGS, "project-bar");
    seedSettingsAt(LOCAL_SETTINGS, "local-bar");
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "local", command: "local-bar" });
  });

  it("ignores project/local without a workspace", () => {
    seedSettingsAt(SETTINGS_FILE, "global-bar");
    seedSettingsAt(PROJECT_SETTINGS, "project-bar");
    expect(resolveEffectiveScope()).toEqual({ scope: "global", command: "global-bar" });
  });
});

describe("isStatuslineInstalled", () => {
  it("true when the effective scope's command points at the tap", () => {
    seedSettingsAt(PROJECT_SETTINGS, TAP_COMMAND);
    expect(isStatuslineInstalled(WS)).toBe(true);
  });
  it("false when a project statusline shadows the global tap", () => {
    seedSettingsAt(SETTINGS_FILE, TAP_COMMAND);
    seedSettingsAt(PROJECT_SETTINGS, "project-bar");
    // project wins → effective command is project-bar (no tap) → not installed
    expect(isStatuslineInstalled(WS)).toBe(false);
  });
});

describe("installStatusline (scope-aware)", () => {
  it("installs at global when nothing else defines statusLine", () => {
    installStatusline("/dist/statusline-tap.js");
    const inner = JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!);
    expect(inner).toEqual({ scope: "global", command: "" });
    expect(settings.calls).toContainEqual({
      key: "statusLine.command",
      value: TAP_COMMAND,
      scope: "global",
      workspacePath: undefined,
    });
  });

  it("installs at project when project overrides global", () => {
    seedSettingsAt(SETTINGS_FILE, "global-bar");
    seedSettingsAt(PROJECT_SETTINGS, "project-bar");
    installStatusline("/dist/statusline-tap.js", WS);
    const inner = JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!);
    expect(inner).toEqual({ scope: "project", command: "project-bar", workspacePath: WS });
    expect(settings.calls).toContainEqual({
      key: "statusLine.command",
      value: TAP_COMMAND,
      scope: "project",
      workspacePath: WS,
    });
  });

  it("installs at local when local overrides everything", () => {
    seedSettingsAt(LOCAL_SETTINGS, "local-bar");
    installStatusline("/dist/statusline-tap.js", WS);
    const inner = JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!);
    expect(inner).toEqual({ scope: "local", command: "local-bar", workspacePath: WS });
    expect(settings.calls[0].scope).toBe("local");
  });

  it("does not overwrite the recorded inner on re-install", () => {
    seedSettingsAt(PROJECT_SETTINGS, TAP_COMMAND);
    fsState.files.set(
      STATUSLINE_INNER_FILE,
      JSON.stringify({ scope: "project", command: "orig-bar", workspacePath: WS }),
    );
    installStatusline("/dist/statusline-tap.js", WS);
    const inner = JSON.parse(fsState.files.get(STATUSLINE_INNER_FILE)!);
    expect(inner.command).toBe("orig-bar");
  });
});

describe("uninstallStatusline (scope-aware)", () => {
  it("restores the original command at the recorded scope", () => {
    fsState.files.set(
      STATUSLINE_INNER_FILE,
      JSON.stringify({ scope: "project", command: "orig-bar", workspacePath: WS }),
    );
    fsState.files.set(STATUSLINE_TAP_FILE, "TAP-CONTENT");
    fsState.files.set(STATUSLINE_CACHE_FILE, "{}");

    uninstallStatusline(WS);
    expect(settings.calls).toContainEqual({
      key: "statusLine.command",
      value: "orig-bar",
      scope: "project",
      workspacePath: WS,
    });
    expect(fsState.removed).toEqual(
      expect.arrayContaining([STATUSLINE_INNER_FILE, STATUSLINE_TAP_FILE, STATUSLINE_CACHE_FILE]),
    );
  });

  it("with no sidecar, clears the tap from whichever scope holds it", () => {
    seedSettingsAt(PROJECT_SETTINGS, TAP_COMMAND);
    uninstallStatusline(WS);
    expect(settings.calls).toContainEqual({
      key: "statusLine.command",
      value: "",
      scope: "project",
      workspacePath: WS,
    });
  });
});
