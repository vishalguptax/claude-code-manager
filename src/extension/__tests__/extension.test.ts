import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { _fireConfigChange, _resetListeners, _setVersion } from "../../__mocks__/vscode";
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
  // Back to the engines floor so a version-gated test can't leak into
  // the next one.
  _setVersion("1.90.0");
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

describe("secondary sidebar placement", () => {
  /** Register spies and run activate(), returning the spies. */
  function activateWithSpies() {
    vi.spyOn(ClaudeSessionViewProvider.prototype, "refreshSettings").mockImplementation(() => {});
    const registerProviderSpy = vi
      .spyOn(vscode.window, "registerWebviewViewProvider")
      .mockReturnValue({ dispose: () => {} });
    const executeCommandSpy = vi
      .spyOn(vscode.commands, "executeCommand")
      .mockResolvedValue(undefined);
    const registerCommandSpy = vi
      .spyOn(vscode.commands, "registerCommand")
      .mockReturnValue({ dispose: () => {} });

    activate(makeContext() as unknown as vscode.ExtensionContext);
    return { registerProviderSpy, executeCommandSpy, registerCommandSpy };
  }

  /** Invoke the callback registered for a command id. */
  function runCommand(
    spy: ReturnType<typeof vi.spyOn>,
    commandId: string,
  ): void {
    const entry = spy.mock.calls.find((call) => call[0] === commandId);
    (entry?.[1] as () => void)();
  }

  it("sets the context key on hosts older than 1.106", () => {
    _setVersion("1.105.2");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:doesNotSupportSecondarySidebar",
      true,
    );
  });

  it("leaves the context key unset on 1.106 and newer", () => {
    _setVersion("1.106.0");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).not.toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:doesNotSupportSecondarySidebar",
      expect.anything(),
    );
  });

  it("registers one provider instance for both view ids", () => {
    const { registerProviderSpy } = activateWithSpies();

    const registrations = registerProviderSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith("claudeCodeManager."),
    );
    expect(registrations.map((call) => call[0])).toEqual([
      "claudeCodeManager.view",
      "claudeCodeManager.secondaryView",
    ]);
    expect(registrations[0][1]).toBe(registrations[1][1]);
    for (const call of registrations) {
      expect(call[2]).toEqual({ webviewOptions: { retainContextWhenHidden: true } });
    }
  });

  it("focuses the activity-bar view on old hosts", () => {
    _setVersion("1.90.0");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.view.focus");
  });

  it("focuses the secondary-sidebar view on new hosts", () => {
    _setVersion("1.106.0");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.secondaryView.focus");
  });
});
