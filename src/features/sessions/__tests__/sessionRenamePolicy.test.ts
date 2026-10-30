import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

vi.mock("../../../core/config", () => ({
  SESSION_RENAME_TAP_FILE: "/home/.claude/.claude-manager/session-rename-tap.js",
}));
vi.mock("../hookInstall", () => ({
  copyHookScript: vi.fn(() => null),
  ensureHooks: vi.fn(() => ({ ok: true, changed: true })),
  removeHooks: vi.fn(() => ({ ok: true, changed: true })),
}));
vi.mock("../renames", () => ({
  moveRenamesToPending: vi.fn(),
  movePendingToRenames: vi.fn(),
}));

import { copyHookScript, ensureHooks, removeHooks } from "../hookInstall";
import { movePendingToRenames, moveRenamesToPending } from "../renames";
import { chooseRenameTarget, syncRenameHook, watchRenameSetting } from "../sessionRenamePolicy";

const copy = vi.mocked(copyHookScript);
const ensure = vi.mocked(ensureHooks);
const remove = vi.mocked(removeHooks);
const toPending = vi.mocked(moveRenamesToPending);
const toSidebar = vi.mocked(movePendingToRenames);

const SCRIPT = "/home/.claude/.claude-manager/session-rename-tap.js";

let update: ReturnType<typeof vi.fn>;

/** Point `inspect` at a user value, or at nothing for an untouched setting. */
function setUserChoice(value: boolean | undefined): void {
  update = vi.fn(async () => {});
  vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
    inspect: () => (value === undefined ? undefined : { globalValue: value }),
    update,
  } as never);
}

beforeEach(() => {
  vi.restoreAllMocks();
  copy.mockClear().mockReturnValue(null);
  ensure.mockClear().mockReturnValue({ ok: true, changed: true });
  remove.mockClear().mockReturnValue({ ok: true, changed: true });
  toPending.mockClear();
  toSidebar.mockClear();
});

describe("syncRenameHook", () => {
  it("installs the hook on both title events and hands names over when on", () => {
    setUserChoice(true);
    syncRenameHook("/dist", "activation");
    expect(copy).toHaveBeenCalledWith("/dist", "session-rename-tap.js", SCRIPT);
    expect(ensure).toHaveBeenCalledWith([
      { event: "SessionStart", scriptFile: SCRIPT },
      { event: "UserPromptSubmit", scriptFile: SCRIPT },
    ]);
    expect(toPending).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps names sidebar-only when the hook cannot be installed", () => {
    setUserChoice(true);
    const warn = vi.spyOn(vscode.window, "showWarningMessage");
    ensure.mockReturnValue({ ok: false, reason: "invalid", error: "settings.json is not JSON" });
    syncRenameHook("/dist", "setting-change");
    expect(toPending).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Couldn't install the rename hook: settings.json is not JSON.",
    );
  });

  it("does not try the settings when the script cannot be copied", () => {
    setUserChoice(true);
    copy.mockReturnValue({ ok: false, reason: "copy-failed", error: "no space" });
    syncRenameHook("/dist", "activation");
    expect(ensure).not.toHaveBeenCalled();
    expect(toPending).not.toHaveBeenCalled();
  });

  it("removes the hook and keeps unapplied renames in the sidebar when off", () => {
    setUserChoice(false);
    syncRenameHook("/dist", "activation");
    expect(remove).toHaveBeenCalledTimes(1);
    expect(toSidebar).toHaveBeenCalledTimes(1);
    expect(ensure).not.toHaveBeenCalled();
  });

  it("touches nothing while the user has not chosen", () => {
    setUserChoice(undefined);
    syncRenameHook("/dist", "activation");
    expect(copy).not.toHaveBeenCalled();
    expect(ensure).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(toPending).not.toHaveBeenCalled();
    expect(toSidebar).not.toHaveBeenCalled();
  });
});

describe("chooseRenameTarget", () => {
  it("follows the setting without asking once the user has chosen", async () => {
    setUserChoice(false);
    const ask = vi.spyOn(vscode.window, "showInformationMessage");
    expect(await chooseRenameTarget()).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks on the first rename and records the answer globally", async () => {
    setUserChoice(undefined);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      "Rename in Claude Code" as never,
    );
    expect(await chooseRenameTarget()).toBe(true);
    expect(update).toHaveBeenCalledWith(
      "renameInClaudeCode",
      true,
      vscode.ConfigurationTarget.Global,
    );
  });

  it("records Sidebar Only as false", async () => {
    setUserChoice(undefined);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue("Sidebar Only" as never);
    expect(await chooseRenameTarget()).toBe(false);
    expect(update).toHaveBeenCalledWith(
      "renameInClaudeCode",
      false,
      vscode.ConfigurationTarget.Global,
    );
  });

  it("records nothing when the question is dismissed", async () => {
    setUserChoice(undefined);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
    expect(await chooseRenameTarget()).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("watchRenameSetting", () => {
  it("re-syncs when the setting changes, and only then", () => {
    let fire: ((e: { affectsConfiguration: (s: string) => boolean }) => void) | undefined;
    vi.spyOn(vscode.workspace, "onDidChangeConfiguration").mockImplementation(
      (listener: never) => {
        fire = listener;
        return { dispose: () => {} } as never;
      },
    );
    setUserChoice(false);
    watchRenameSetting("/dist");

    fire?.({ affectsConfiguration: () => false });
    expect(remove).not.toHaveBeenCalled();

    fire?.({ affectsConfiguration: (s) => s === "claudeManager.sessions.renameInClaudeCode" });
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
