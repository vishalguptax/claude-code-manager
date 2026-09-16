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

  /** Pin `claudeManager.placement` for the duration of one activation. */
  function withPlacement(value: string): void {
    vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
      get: (key: string, fallback?: unknown) => (key === "placement" ? value : fallback),
      inspect: () => undefined,
      update: async () => {},
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  }

  it("keeps the panel in the activity bar by default, even on a capable host", () => {
    // The regression that prompted this: upgrading silently relocated a
    // panel the user had deliberately left in the activity bar.
    _setVersion("1.137.0");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:useSecondarySidebar",
      false,
    );
  });

  it("moves the panel when the setting asks and the host can render it", () => {
    _setVersion("1.137.0");
    withPlacement("secondarySidebar");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:useSecondarySidebar",
      true,
    );
  });

  it("refuses to move on a host too old to render the secondary sidebar", () => {
    _setVersion("1.105.2");
    withPlacement("secondarySidebar");
    const { executeCommandSpy } = activateWithSpies();

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:useSecondarySidebar",
      false,
    );
  });

  it("re-applies the placement when the setting changes, without a reload", () => {
    _setVersion("1.137.0");
    const { executeCommandSpy } = activateWithSpies();
    expect(executeCommandSpy).toHaveBeenLastCalledWith(
      "setContext",
      "claudeCodeManager:useSecondarySidebar",
      false,
    );

    withPlacement("secondarySidebar");
    _fireConfigChange("claudeManager.placement");

    expect(executeCommandSpy).toHaveBeenCalledWith(
      "setContext",
      "claudeCodeManager:useSecondarySidebar",
      true,
    );
  });

  it("ignores configuration changes to unrelated settings", () => {
    _setVersion("1.137.0");
    const { executeCommandSpy } = activateWithSpies();
    const before = executeCommandSpy.mock.calls.filter((c) => c[0] === "setContext").length;

    _fireConfigChange("claudeManager.density");

    const after = executeCommandSpy.mock.calls.filter((c) => c[0] === "setContext").length;
    expect(after).toBe(before);
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

  it("focuses the activity-bar view under the default placement", () => {
    _setVersion("1.137.0");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.view.focus");
  });

  it("focuses the secondary-sidebar view once the setting moves it", () => {
    _setVersion("1.137.0");
    withPlacement("secondarySidebar");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    runCommand(registerCommandSpy, "claudeManager.open");
    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.secondaryView.focus");
  });

  it("follows the panel when the placement changes after activation", () => {
    // Focus targets a view id; if the command kept pointing at the old id
    // after a move, Cmd+Alt+C would silently do nothing.
    _setVersion("1.137.0");
    const { executeCommandSpy, registerCommandSpy } = activateWithSpies();

    withPlacement("secondarySidebar");
    _fireConfigChange("claudeManager.placement");
    runCommand(registerCommandSpy, "claudeManager.open");

    expect(executeCommandSpy).toHaveBeenCalledWith("claudeCodeManager.secondaryView.focus");
  });
});
