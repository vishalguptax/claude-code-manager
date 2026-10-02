import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WriteOutcome } from "../../../core/atomicWrite";

const parser = vi.hoisted(() => ({
  parseAccountData: vi.fn((_ws?: string) => ({ marker: "account" }) as unknown),
  writeSettingsValue: vi.fn((..._args: unknown[]): WriteOutcome => ({ ok: true })),
  addPermissionEntry: vi.fn((..._args: unknown[]): WriteOutcome => ({ ok: true })),
  removePermissionEntry: vi.fn((..._args: unknown[]): WriteOutcome => ({ ok: true })),
  resolveSettingsPath: vi.fn((_scope: string, _ws?: string) => "/home/.claude/settings.json"),
  restoreClaudeJsonFromBackup: vi.fn(),
}));
const { postAccountData } = vi.hoisted(() => ({ postAccountData: vi.fn() }));

vi.mock("../../account/parser", () => parser);
vi.mock("../accountPush", () => ({ postAccountData }));
const workspace = vi.hoisted(() => ({ path: "/ws" }));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => workspace.path }));
vi.mock("../../../extension/terminal", () => ({ createTerminal: vi.fn(), runInTerminal: vi.fn() }));

import * as vscode from "vscode";
import { handleSettingsMessage } from "../settingsHandlers";
import type { HostContext } from "../hostContext";
import type { WebviewMessage } from "../types";

const ctx = { getWebview: () => ({}) } as unknown as HostContext;
const send = (msg: Record<string, unknown>): Promise<boolean> =>
  handleSettingsMessage(msg as unknown as WebviewMessage, ctx);

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  workspace.path = "/ws";
  vi.restoreAllMocks();
  vi.clearAllMocks();
  info = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined);
  error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
  warn = vi.spyOn(vscode.window, "showWarningMessage");
});

describe("restoreClaudeConfig", () => {
  it("does nothing when the user cancels the confirm", async () => {
    warn.mockResolvedValue(undefined);
    await send({ type: "restoreClaudeConfig" });
    expect(parser.restoreClaudeJsonFromBackup).not.toHaveBeenCalled();
  });

  it("reports the backup it restored from and re-pushes", async () => {
    warn.mockResolvedValue("Restore" as never);
    parser.restoreClaudeJsonFromBackup.mockReturnValue({
      status: "restored",
      backupPath: "/home/.claude/backups/.claude.json.backup.123",
    });
    await send({ type: "restoreClaudeConfig" });
    expect(info).toHaveBeenCalledWith(
      "Restored ~/.claude.json from backup (.claude.json.backup.123).",
    );
    expect(postAccountData).toHaveBeenCalled();
  });

  it("tells the user a file that is valid again no longer needs restoring", async () => {
    // The banner can come from a parse that caught the CLI mid-write;
    // the parser re-checks and leaves the newer file alone.
    warn.mockResolvedValue("Restore" as never);
    parser.restoreClaudeJsonFromBackup.mockReturnValue({ status: "healthy" });
    await send({ type: "restoreClaudeConfig" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining("no longer needs restoring"));
    expect(error).not.toHaveBeenCalled();
    expect(postAccountData).toHaveBeenCalled();
  });

  it("errors when no valid backup exists", async () => {
    warn.mockResolvedValue("Restore" as never);
    parser.restoreClaudeJsonFromBackup.mockReturnValue({ status: "no-backup" });
    await send({ type: "restoreClaudeConfig" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("No valid backup"));
    expect(info).not.toHaveBeenCalled();
  });
});

describe("settings writes", () => {
  const REFUSAL =
    "/home/.claude/settings.json is being written by Claude Code right now, so it was left untouched. Try again in a moment";

  it("passes the writer's reason through when a write is refused", async () => {
    parser.writeSettingsValue.mockReturnValueOnce({ ok: false, error: REFUSAL });
    await send({ type: "setModel", model: "opus" });
    expect(error).toHaveBeenCalledWith(`Couldn't save: ${REFUSAL}.`, "Open file");
  });

  it("surfaces a refused permission edit instead of dropping it", async () => {
    parser.addPermissionEntry.mockReturnValueOnce({ ok: false, error: REFUSAL });
    await send({ type: "addPermission", scope: "global", tool: "Read", list: "allow" });
    expect(error).toHaveBeenCalledWith(`Couldn't save: ${REFUSAL}.`, "Open file");
  });

  it("explains a project write refused because the workspace is the home folder", async () => {
    parser.writeSettingsValue.mockReturnValueOnce({ ok: false, error: "no settings file" });
    parser.resolveSettingsPath.mockReturnValueOnce(null as unknown as string);
    await send({ type: "setSetting", key: "model", value: "opus", scope: "project" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("home folder"));
  });

  it("stays quiet when the write lands", async () => {
    await send({ type: "setModel", model: "opus" });
    expect(parser.writeSettingsValue).toHaveBeenCalledWith("model", "opus");
    expect(error).not.toHaveBeenCalled();
  });

  it("returns false for a message it does not own", async () => {
    expect(await send({ type: "notASettingsMessage" })).toBe(false);
  });
});

describe("openSettingsFile", () => {
  it("says project settings are the global file when the home folder is open", async () => {
    parser.resolveSettingsPath.mockReturnValueOnce(null as unknown as string);
    await send({ type: "openSettingsFile", scope: "project" });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("home folder open, project settings are your global settings"));
  });

  it("says no folder is open when there is no workspace", async () => {
    workspace.path = "";
    parser.resolveSettingsPath.mockReturnValueOnce(null as unknown as string);
    await send({ type: "openSettingsFile", scope: "local" });
    expect(error).toHaveBeenCalledWith("No workspace folder open");
  });
});
