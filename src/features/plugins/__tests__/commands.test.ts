import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { copyPluginId, openPluginSettingsFile, revealPluginDirectory } from "../commands";
import type { PluginEntry } from "../types";

function entry(overrides: Partial<PluginEntry> = {}): PluginEntry {
  return {
    id: "caveman@caveman",
    name: "caveman",
    marketplace: "caveman",
    description: "",
    version: "1.0.0",
    installPath: "/home/dev/.claude/plugins/cache/caveman/caveman/1.0.0",
    installScope: "user",
    installed: true,
    enabled: true,
    decidedBy: "global",
    declaredIn: [{ scope: "global", enabled: true }],
    status: "enabled",
    marketplaceTrust: "known",
    untrustedSource: false,
    config: null,
    ...overrides,
  };
}

describe("revealPluginDirectory", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reveals the install directory in the OS file manager", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    await revealPluginDirectory(entry());
    expect(exec).toHaveBeenCalledWith(
      "revealFileInOS",
      expect.objectContaining({ fsPath: "/home/dev/.claude/plugins/cache/caveman/caveman/1.0.0" }),
    );
  });

  it("explains that an orphaned plugin has no directory instead of opening one", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await revealPluginDirectory(entry({ installed: false, installPath: "", status: "orphaned" }));
    expect(exec).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("no installed copy");
  });

  it("reports a plugin that has vanished from the list", async () => {
    const exec = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await revealPluginDirectory(undefined);
    expect(exec).not.toHaveBeenCalled();
    expect(String(error.mock.calls[0][0])).toContain("refresh");
  });

  it("surfaces a failed reveal rather than throwing across the message boundary", async () => {
    vi.spyOn(vscode.commands, "executeCommand").mockRejectedValue(new Error("nope"));
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await expect(revealPluginDirectory(entry())).resolves.toBeUndefined();
    expect(String(error.mock.calls[0][0])).toContain("Could not open");
  });
});

describe("openPluginSettingsFile", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("opens the resolved settings file in an editor", async () => {
    const open = vi.spyOn(vscode.workspace, "openTextDocument").mockResolvedValue({} as never);
    const show = vi.spyOn(vscode.window, "showTextDocument").mockResolvedValue(undefined);
    await openPluginSettingsFile("/repo/.claude/settings.local.json", "local");
    expect(open).toHaveBeenCalledWith("/repo/.claude/settings.local.json");
    expect(show).toHaveBeenCalled();
  });

  it("names the scope when there is no file for it", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await openPluginSettingsFile(null, "project");
    expect(String(error.mock.calls[0][0])).toContain("project settings file");
  });

  it("calls the user scope 'user', matching Claude Code's own wording", async () => {
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await openPluginSettingsFile(null, "global");
    expect(String(error.mock.calls[0][0])).toContain("user settings file");
  });

  it("suggests the file may not exist yet when the open fails", async () => {
    vi.spyOn(vscode.workspace, "openTextDocument").mockRejectedValue(new Error("ENOENT"));
    const error = vi.spyOn(vscode.window, "showErrorMessage").mockResolvedValue(undefined);
    await openPluginSettingsFile("/repo/.claude/settings.local.json", "local");
    expect(String(error.mock.calls[0][0])).toContain("may not exist yet");
  });
});

describe("copyPluginId", () => {
  it("writes the id to the clipboard verbatim", async () => {
    const write = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue(undefined);
    await copyPluginId("caveman@caveman");
    expect(write).toHaveBeenCalledWith("caveman@caveman");
  });
});
