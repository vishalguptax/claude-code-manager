import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

vi.mock("../sessionTapInstall", () => ({
  ensureSessionStartHook: vi.fn(() => true),
  removeSessionStartHook: vi.fn(() => true),
  isSessionStartHookInstalled: vi.fn(() => false),
}));

import {
  ensureSessionStartHook,
  isSessionStartHookInstalled,
  removeSessionStartHook,
} from "../sessionTapInstall";
import {
  isTerminalLinkingEnabled,
  offerSessionTapNudge,
  syncSessionTap,
  TERMINAL_LINKING_SETTING,
  watchTerminalLinkingSetting,
} from "../sessionTapPolicy";

const ensure = vi.mocked(ensureSessionStartHook);
const remove = vi.mocked(removeSessionStartHook);
const installed = vi.mocked(isSessionStartHookInstalled);

/** Point `inspect` at a user value, or at nothing for an untouched setting. */
function setUserChoice(value: boolean | undefined): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
    inspect: () => (value === undefined ? undefined : { globalValue: value }),
    update: vi.fn(async () => {}),
  } as never);
}

/** Minimal ExtensionContext with a real in-memory globalState. */
function fakeContext(seed: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    globalState: {
      get: (key: string) => store.get(key),
      update: async (key: string, value: unknown) => {
        store.set(key, value);
      },
    },
  } as unknown as vscode.ExtensionContext;
}

beforeEach(() => {
  vi.restoreAllMocks();
  ensure.mockClear().mockReturnValue(true);
  remove.mockClear().mockReturnValue(true);
  installed.mockClear().mockReturnValue(false);
});

describe("syncSessionTap", () => {
  it("installs when the user turned it on", () => {
    setUserChoice(true);
    syncSessionTap("/dist");
    expect(ensure).toHaveBeenCalledWith("/dist");
    expect(remove).not.toHaveBeenCalled();
  });

  it("removes the hook when the user turned it off", () => {
    setUserChoice(false);
    installed.mockReturnValue(true);
    syncSessionTap("/dist");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("writes nothing at all on an untouched machine with no hook", () => {
    // The whole point of the gate: a fresh install must leave
    // ~/.claude/settings.json exactly as it found it.
    setUserChoice(undefined);
    installed.mockReturnValue(false);
    syncSessionTap("/dist");
    expect(ensure).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps converging a hook that is already installed", () => {
    // Migration: the hook shipped unconditionally for many releases, so
    // an existing user has never set the setting. Their linking must
    // keep working, including the node-path refresh ensure performs.
    setUserChoice(undefined);
    installed.mockReturnValue(true);
    syncSessionTap("/dist");
    expect(ensure).toHaveBeenCalledWith("/dist");
    expect(remove).not.toHaveBeenCalled();
  });

  it("survives an installer that throws", () => {
    setUserChoice(true);
    ensure.mockImplementation(() => {
      throw new Error("disk on fire");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => syncSessionTap("/dist")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("ignores a value set by a workspace rather than the user", () => {
    // A committed .vscode/settings.json must not be able to install a
    // machine-global hook on a contributor's machine.
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      inspect: () => ({ workspaceValue: true }),
      update: vi.fn(async () => {}),
    } as never);
    installed.mockReturnValue(false);
    syncSessionTap("/dist");
    expect(ensure).not.toHaveBeenCalled();
  });
});

describe("isTerminalLinkingEnabled", () => {
  it("follows an explicit choice in both directions", () => {
    setUserChoice(true);
    installed.mockReturnValue(false);
    expect(isTerminalLinkingEnabled()).toBe(true);

    setUserChoice(false);
    installed.mockReturnValue(true);
    expect(isTerminalLinkingEnabled()).toBe(false);
  });

  it("falls back to what settings.json already says", () => {
    setUserChoice(undefined);
    installed.mockReturnValue(true);
    expect(isTerminalLinkingEnabled()).toBe(true);
    installed.mockReturnValue(false);
    expect(isTerminalLinkingEnabled()).toBe(false);
  });
});

describe("watchTerminalLinkingSetting", () => {
  it("re-syncs when the setting changes, so the toggle acts at once", () => {
    setUserChoice(true);
    let fire: ((e: { affectsConfiguration: (s: string) => boolean }) => void) | undefined;
    vi.spyOn(vscode.workspace, "onDidChangeConfiguration").mockImplementation(
      (listener: never) => {
        fire = listener;
        return { dispose: () => {} } as never;
      },
    );
    watchTerminalLinkingSetting("/dist");
    fire?.({ affectsConfiguration: (s: string) => s === TERMINAL_LINKING_SETTING });
    expect(ensure).toHaveBeenCalledWith("/dist");
  });

  it("ignores unrelated setting changes", () => {
    setUserChoice(true);
    let fire: ((e: { affectsConfiguration: (s: string) => boolean }) => void) | undefined;
    vi.spyOn(vscode.workspace, "onDidChangeConfiguration").mockImplementation(
      (listener: never) => {
        fire = listener;
        return { dispose: () => {} } as never;
      },
    );
    watchTerminalLinkingSetting("/dist");
    fire?.({ affectsConfiguration: () => false });
    expect(ensure).not.toHaveBeenCalled();
  });
});

describe("offerSessionTapNudge", () => {
  it("installs and records the choice when the user accepts", async () => {
    const update = vi.fn(async () => {});
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      inspect: () => undefined,
      update,
    } as never);
    installed.mockReturnValueOnce(false).mockReturnValue(true);
    const info = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockResolvedValue("Enable" as never);

    const context = fakeContext();
    await offerSessionTapNudge(context, "/dist");

    expect(info).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      "terminalLinking",
      true,
      vscode.ConfigurationTarget.Global,
    );
    expect(ensure).toHaveBeenCalledWith("/dist");
    expect(context.globalState.get("sessionTapNudge.shown")).toBe(true);
  });

  it("writes nothing when the user declines, and never asks again", async () => {
    setUserChoice(undefined);
    const info = vi
      .spyOn(vscode.window, "showInformationMessage")
      .mockResolvedValue("Not now" as never);

    const context = fakeContext();
    await offerSessionTapNudge(context, "/dist");
    await offerSessionTapNudge(context, "/dist");

    expect(info).toHaveBeenCalledTimes(1);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("does not ask a user who already has the hook", async () => {
    setUserChoice(undefined);
    installed.mockReturnValue(true);
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    await offerSessionTapNudge(fakeContext(), "/dist");
    expect(info).not.toHaveBeenCalled();
  });

  it("does not ask a user who has already answered the setting", async () => {
    setUserChoice(false);
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    await offerSessionTapNudge(fakeContext(), "/dist");
    expect(info).not.toHaveBeenCalled();
  });

  it("reports an unparseable settings.json instead of failing silently", async () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      inspect: () => undefined,
      update: vi.fn(async () => {}),
    } as never);
    // Never installed: ensure could not write, which it reports the same
    // way as "nothing to do" — hence the read-back check.
    installed.mockReturnValue(false);
    ensure.mockReturnValue(false);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue("Enable" as never);
    const warn = vi.spyOn(vscode.window, "showWarningMessage").mockResolvedValue(
      undefined as never,
    );

    await offerSessionTapNudge(fakeContext(), "/dist");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("settings.json");
  });
});
