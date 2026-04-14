import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { _fireConfigChange, _resetListeners } from "../../__mocks__/vscode";
import { ClaudeSessionViewProvider } from "../../features/sessions/viewProvider";
import { activate } from "../extension";

interface FakeContext {
  subscriptions: Array<{ dispose: () => void }>;
  extensionUri: { fsPath: string; scheme: string; path: string };
  globalState: {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
  };
}

function makeContext(): FakeContext {
  const bag = new Map<string, unknown>();
  return {
    subscriptions: [],
    extensionUri: { fsPath: "/ext", scheme: "file", path: "/ext" },
    globalState: {
      get<T>(key: string): T | undefined {
        return bag.get(key) as T | undefined;
      },
      update(key: string, value: unknown): Thenable<void> {
        bag.set(key, value);
        return Promise.resolve();
      },
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  _resetListeners();
});

describe("activate", () => {
  it("calls refreshSettings on the provider when claudeManager settings change", () => {
    const refreshSpy = vi
      .spyOn(ClaudeSessionViewProvider.prototype, "refreshSettings")
      .mockImplementation(() => {});

    activate(makeContext() as unknown as vscode.ExtensionContext);

    _fireConfigChange("claudeManager");
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call refreshSettings for unrelated configuration changes", () => {
    const refreshSpy = vi
      .spyOn(ClaudeSessionViewProvider.prototype, "refreshSettings")
      .mockImplementation(() => {});

    activate(makeContext() as unknown as vscode.ExtensionContext);

    _fireConfigChange("editor.fontSize");
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("registers the webview provider, the open command, and a status bar item", () => {
    vi.spyOn(ClaudeSessionViewProvider.prototype, "refreshSettings").mockImplementation(() => {});

    const registerProviderSpy = vi
      .spyOn(vscode.window, "registerWebviewViewProvider")
      .mockReturnValue({ dispose: () => {} });
    const registerCommandSpy = vi
      .spyOn(vscode.commands, "registerCommand")
      .mockReturnValue({ dispose: () => {} });
    const createStatusBarSpy = vi
      .spyOn(vscode.window, "createStatusBarItem")
      .mockReturnValue({
        text: "",
        tooltip: "",
        command: "",
        show: () => {},
        dispose: () => {},
      } as unknown as ReturnType<typeof vscode.window.createStatusBarItem>);

    activate(makeContext() as unknown as vscode.ExtensionContext);

    expect(registerProviderSpy).toHaveBeenCalledWith(
      "claudeCodeManager.view",
      expect.anything(),
      expect.anything(),
    );
    expect(registerCommandSpy).toHaveBeenCalledWith(
      "claudeManager.open",
      expect.any(Function),
    );
    expect(createStatusBarSpy).toHaveBeenCalled();
  });
});
