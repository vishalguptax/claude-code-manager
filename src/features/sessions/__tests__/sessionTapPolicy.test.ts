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
import { syncSessionTap, watchTerminalLinkingSetting } from "../sessionTapPolicy";

const ensure = vi.mocked(ensureSessionStartHook);
const remove = vi.mocked(removeSessionStartHook);
const installed = vi.mocked(isSessionStartHookInstalled);

/** Point `inspect` at a user value, or at nothing for an untouched setting. */
function setUserChoice(value: boolean | undefined): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
    inspect: () => (value === undefined ? undefined : { globalValue: value }),
  } as never);
}

/** Capture the listener `watchTerminalLinkingSetting` registers. */
function captureConfigListener(): () => (e: {
  affectsConfiguration: (s: string) => boolean;
}) => void {
  let fire: ((e: { affectsConfiguration: (s: string) => boolean }) => void) | undefined;
  vi.spyOn(vscode.workspace, "onDidChangeConfiguration").mockImplementation(
    (listener: never) => {
      fire = listener;
      return { dispose: () => {} } as never;
    },
  );
  return () => fire as (e: { affectsConfiguration: (s: string) => boolean }) => void;
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

  it("ignores a value set by a workspace rather than the user", () => {
    // A committed .vscode/settings.json must not be able to install a
    // machine-global hook on a contributor's machine.
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
      inspect: () => ({ workspaceValue: true }),
    } as never);
    installed.mockReturnValue(false);
    syncSessionTap("/dist");
    expect(ensure).not.toHaveBeenCalled();
  });

  it("survives an installer that throws, so activation is never blocked", () => {
    setUserChoice(true);
    ensure.mockImplementation(() => {
      throw new Error("disk on fire");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => syncSessionTap("/dist")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe("watchTerminalLinkingSetting", () => {
  it("re-syncs when the setting changes, so the toggle acts at once", () => {
    setUserChoice(true);
    const listener = captureConfigListener();
    watchTerminalLinkingSetting("/dist");
    listener()({
      affectsConfiguration: (s: string) => s === "claudeManager.sessions.terminalLinking",
    });
    expect(ensure).toHaveBeenCalledWith("/dist");
  });

  it("ignores unrelated setting changes", () => {
    setUserChoice(true);
    const listener = captureConfigListener();
    watchTerminalLinkingSetting("/dist");
    listener()({ affectsConfiguration: () => false });
    expect(ensure).not.toHaveBeenCalled();
  });
});
