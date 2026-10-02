import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { _fireConfigChange, _resetListeners } from "../../__mocks__/vscode";
import { hostClaudeEnv, watchClaudeConfigDirSetting } from "../claudeConfigDir";

/** Stand in for the user's `claudeCode.environmentVariables` value. */
function setEnvSetting(value: unknown): void {
  vi.spyOn(vscode.workspace, "getConfiguration").mockImplementation(
    (section?: string) =>
      ({
        get: (key: string) =>
          section === "claudeCode" && key === "environmentVariables" ? value : undefined,
      }) as unknown as ReturnType<typeof vscode.workspace.getConfiguration>,
  );
}

/** Let the async listener run to completion. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.restoreAllMocks();
  _resetListeners();
});
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR;
});

describe("hostClaudeEnv", () => {
  it("is empty with neither the variable nor the setting", () => {
    setEnvSetting(undefined);
    expect(hostClaudeEnv()).toEqual({});
  });

  it("uses the inherited CLAUDE_CONFIG_DIR", () => {
    process.env.CLAUDE_CONFIG_DIR = "/from-env";
    setEnvSetting(undefined);
    expect(hostClaudeEnv()).toEqual({ CLAUDE_CONFIG_DIR: "/from-env" });
  });

  it("lets the official extension's setting override it, as its own spawn does", () => {
    process.env.CLAUDE_CONFIG_DIR = "/from-env";
    setEnvSetting([{ name: "CLAUDE_CONFIG_DIR", value: "/from-setting" }]);
    expect(hostClaudeEnv()).toEqual({ CLAUDE_CONFIG_DIR: "/from-setting" });
  });
});

describe("watchClaudeConfigDirSetting", () => {
  it("offers a reload when the setting moves the config dir, and reloads on accept", async () => {
    setEnvSetting([{ name: "CLAUDE_CONFIG_DIR", value: "/new" }]);
    const ask = vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
      "Reload Window" as never,
    );
    const run = vi.spyOn(vscode.commands, "executeCommand");
    watchClaudeConfigDirSetting({});
    _fireConfigChange("claudeCode.environmentVariables");
    await settle();
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Reload the window"), "Reload Window");
    expect(run).toHaveBeenCalledWith("workbench.action.reloadWindow");
  });

  it("does not reload when the prompt is dismissed", async () => {
    setEnvSetting([{ name: "CLAUDE_CONFIG_DIR", value: "/new" }]);
    vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(undefined as never);
    const run = vi.spyOn(vscode.commands, "executeCommand");
    watchClaudeConfigDirSetting({});
    _fireConfigChange("claudeCode.environmentVariables");
    await settle();
    expect(run).not.toHaveBeenCalled();
  });

  it("stays quiet when an edit leaves the config dir where it was", async () => {
    setEnvSetting([
      { name: "CLAUDE_CONFIG_DIR", value: "/same" },
      { name: "UNRELATED", value: "1" },
    ]);
    const ask = vi.spyOn(vscode.window, "showInformationMessage");
    watchClaudeConfigDirSetting({ CLAUDE_CONFIG_DIR: "/same" });
    _fireConfigChange("claudeCode.environmentVariables");
    await settle();
    expect(ask).not.toHaveBeenCalled();
  });

  it("ignores other settings", async () => {
    setEnvSetting([{ name: "CLAUDE_CONFIG_DIR", value: "/new" }]);
    const ask = vi.spyOn(vscode.window, "showInformationMessage");
    watchClaudeConfigDirSetting({});
    _fireConfigChange("claudeCode.preferredLocation");
    await settle();
    expect(ask).not.toHaveBeenCalled();
  });
});
