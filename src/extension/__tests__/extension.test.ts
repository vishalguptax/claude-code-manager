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

/**
 * Minimal WebviewView double. Only the members `resolveWebviewView`
 * touches are present; anything else appearing here later means the
 * provider grew a dependency worth noticing.
 */
function makeWebviewView(viewType: string, visible = true): vscode.WebviewView {
  return {
    viewType,
    visible,
    webview: {
      options: {},
      html: "",
      cspSource: "vscode-webview:",
      asWebviewUri: (u: unknown) => u,
      postMessage: async () => true,
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    },
    onDidDispose: () => ({ dispose: () => {} }),
    onDidChangeVisibility: () => ({ dispose: () => {} }),
  } as unknown as vscode.WebviewView;
}

describe("panel placement", () => {
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

  it("advertises secondary-sidebar support on a capable host", () => {
    _setVersion("1.137.0");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:supportsSecondarySidebar",
      true,
    );
  });

  it("withholds the secondary sidebar on a host that cannot render it", () => {
    _setVersion("1.105.2");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:supportsSecondarySidebar",
      false,
    );
  });

  it("withholds it when the version cannot be parsed", () => {
    _setVersion("not-a-version");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:supportsSecondarySidebar",
      false,
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
    // One instance, so both panels share the session cache and watchers.
    expect(registrations[0][1]).toBe(registrations[1][1]);
    for (const call of registrations) {
      expect(call[2]).toEqual({ webviewOptions: { retainContextWhenHidden: true } });
    }
  });

  it("falls back to the activity-bar view when no panel is open yet", () => {
    _setVersion("1.137.0");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.view.focus");
  });

  it("focuses the panel the user actually has open", () => {
    // Focusing a view that never resolved on this host is a silent
    // no-op — the failure this lookup exists to avoid.
    _setVersion("1.137.0");
    const { executeCommandSpy, registerCommandSpy, registerProviderSpy } = activateWithSpies();
    const provider = registerProviderSpy.mock.calls[0][1] as ClaudeSessionViewProvider;
    provider.resolveWebviewView(makeWebviewView("claudeCodeManager.secondaryView"));

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.secondaryView.focus");
  });
});
