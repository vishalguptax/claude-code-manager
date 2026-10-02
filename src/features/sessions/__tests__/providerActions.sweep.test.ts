import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";

/**
 * The interrupted-switch sweep only asks; deciding what counts as an
 * interrupted switch and performing the restore live in account/profiles
 * (tested there against real files). These tests pin the wiring: no prompt
 * without a candidate, the age and account in the prompt, and each answer
 * reaching the right profiles call with the reported backup.
 */
const pending = {
  path: "/home/u/.claude.json.claude-manager-switch.bak",
  legacy: false,
  writtenAt: 0,
  email: "b@x.com",
};
const findMock = vi.fn();
const restoreMock = vi.fn();
const discardMock = vi.fn();
vi.mock("../../account/profiles", () => ({
  findInterruptedSwitch: () => findMock(),
  restoreInterruptedSwitch: (p: unknown) => restoreMock(p),
  discardInterruptedSwitch: (p: unknown) => discardMock(p),
}));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => undefined }));
vi.mock("../worktreeEnrichment", () => ({ postWorktrees: vi.fn() }));

import { sweepSwitchBackups } from "../providerActions";

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  findMock.mockReset();
  restoreMock.mockReset();
  discardMock.mockReset();
  pending.writtenAt = Date.now() - 3 * 3_600_000;
  warn = vi.spyOn(vscode.window, "showWarningMessage");
});
afterEach(() => vi.restoreAllMocks());

describe("sweepSwitchBackups", () => {
  it("stays silent when there is nothing to recover", async () => {
    findMock.mockReturnValue(null);
    await sweepSwitchBackups();
    expect(warn).not.toHaveBeenCalled();
  });

  it("names the backup's age and account in the prompt", async () => {
    findMock.mockReturnValue(pending);
    warn.mockResolvedValue(undefined as never);
    await sweepSwitchBackups();
    const options = warn.mock.calls[0][1] as { detail: string };
    expect(options.detail).toContain("3 hours ago");
    expect(options.detail).toContain("b@x.com");
    expect(options.detail).toContain("projects, trust decisions and MCP settings stay");
    expect(restoreMock).not.toHaveBeenCalled();
    expect(discardMock).not.toHaveBeenCalled();
  });

  it("restores the reported backup on Restore previous", async () => {
    findMock.mockReturnValue(pending);
    warn.mockResolvedValue("Restore previous" as never);
    restoreMock.mockReturnValue({ ok: true, data: "restored" });
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    await sweepSwitchBackups();
    expect(restoreMock).toHaveBeenCalledWith(pending);
    expect(info.mock.calls[0][0]).toContain("restored");
  });

  it("says nothing was restored when the state moved on before the answer", async () => {
    findMock.mockReturnValue(pending);
    warn.mockResolvedValue("Restore previous" as never);
    restoreMock.mockReturnValue({ ok: true, data: "no-longer-needed" });
    const info = vi.spyOn(vscode.window, "showInformationMessage");
    await sweepSwitchBackups();
    expect(info.mock.calls[0][0]).toContain("Nothing to restore");
  });

  it("surfaces why a restore failed", async () => {
    findMock.mockReturnValue(pending);
    warn.mockResolvedValue("Restore previous" as never);
    restoreMock.mockReturnValue({ ok: false, error: "locked", detail: "Try again in a moment." });
    const error = vi.spyOn(vscode.window, "showErrorMessage");
    await sweepSwitchBackups();
    expect(error).toHaveBeenCalledWith("Restore failed: Try again in a moment.");
  });

  it("discards only on Discard backup, and leaves it on Later", async () => {
    findMock.mockReturnValue(pending);
    warn.mockResolvedValue("Discard backup" as never);
    await sweepSwitchBackups();
    expect(discardMock).toHaveBeenCalledWith(pending);

    discardMock.mockReset();
    warn.mockResolvedValue("Later" as never);
    await sweepSwitchBackups();
    expect(discardMock).not.toHaveBeenCalled();
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

describe("sweepSwitchBackups — backup age", () => {
  it.each([
    [60_000, "1 minute ago"],
    [5 * 60_000, "5 minutes ago"],
    [3_600_000, "1 hour ago"],
    [2 * 86_400_000, "2 days ago"],
  ])("words a backup %d ms old as %j", async (age, words) => {
    findMock.mockReturnValue({ ...pending, writtenAt: Date.now() - age });
    warn.mockResolvedValue(undefined as never);
    await sweepSwitchBackups();
    const options = warn.mock.calls[0][1] as { detail: string };
    expect(options.detail).toContain(`interrupted ${words},`);
  });
});
