import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { _resetListeners, _webviewPanels } from "../../../__mocks__/vscode";
import {
  EXPLORER_PANEL_TYPE,
  SESSION_PANEL_TYPE,
  createSessionPanels,
  panelTitle,
} from "../sessionPanels";

vi.mock("../../../extension/html", () => ({
  getWebviewHtml: (_wv: unknown, _uri: unknown, boot?: { view: string; sessionId?: string }) =>
    `<html data-boot="${boot?.view}:${boot?.sessionId ?? ""}"></html>`,
}));

function setup() {
  const deps = {
    extensionUri: vscode.Uri.joinPath({ path: "/ext" } as vscode.Uri),
    onMessage: vi.fn(),
    onChange: vi.fn(),
    onVisibilityChange: vi.fn(),
  };
  return { deps, panels: createSessionPanels(deps) };
}

beforeEach(() => _resetListeners());

describe("panelTitle", () => {
  it("flattens whitespace and keeps a short name as is", () => {
    expect(panelTitle("  fix\n token   refresh ")).toBe("fix token refresh");
  });

  it("truncates a long name with an ellipsis", () => {
    const title = panelTitle("x".repeat(80));
    expect(title).toHaveLength(40);
    expect(title.endsWith("…")).toBe(true);
  });

  it("names an empty session", () => {
    expect(panelTitle("   ")).toBe("Session");
  });
});

describe("createSessionPanels", () => {
  it("opens a tab booted for the session, with scripts and find enabled", () => {
    const { deps, panels } = setup();
    panels.openSession("s-1", "fix token refresh");

    expect(_webviewPanels).toHaveLength(1);
    const panel = _webviewPanels[0];
    expect(panel.viewType).toBe(SESSION_PANEL_TYPE);
    expect(panel.title).toBe("fix token refresh");
    expect(panel.column).toBe(vscode.ViewColumn.Active);
    expect(panel.options).toMatchObject({ enableScripts: true, enableFindWidget: true });
    expect(panel.webview.html).toBe('<html data-boot="session:s-1"></html>');
    expect(panels.size).toBe(1);
    expect(deps.onChange).toHaveBeenCalledTimes(1);
  });

  it("reveals the existing tab instead of opening a second one", () => {
    const { panels } = setup();
    panels.openSession("s-1", "a");
    panels.openSession("s-1", "a");
    expect(_webviewPanels).toHaveLength(1);
    expect(_webviewPanels[0].revealed).toBe(1);
  });

  it("forwards the tab's messages to the host dispatch", () => {
    const { deps, panels } = setup();
    panels.openSession("s-1", "a");
    _webviewPanels[0]._receive({ type: "pinSession", sessionId: "s-1" });
    expect(deps.onMessage).toHaveBeenCalledWith({ type: "pinSession", sessionId: "s-1" });
  });

  it("reports visibility and lists the webviews it holds", () => {
    const { deps, panels } = setup();
    panels.openSession("s-1", "a");
    panels.openSession("s-2", "b");
    expect(panels.webviews()).toHaveLength(2);
    expect(panels.anyVisible()).toBe(true);

    _webviewPanels[0]._setVisible(false);
    _webviewPanels[1]._setVisible(false);
    expect(panels.anyVisible()).toBe(false);
    expect(deps.onVisibilityChange).toHaveBeenCalledTimes(2);
  });

  it("forgets a closed tab, so opening the session again makes a new one", () => {
    const { deps, panels } = setup();
    panels.openSession("s-1", "a");
    _webviewPanels[0]._dispose();
    expect(panels.size).toBe(0);
    expect(deps.onChange).toHaveBeenCalledTimes(2);

    panels.openSession("s-1", "a");
    expect(_webviewPanels).toHaveLength(2);
  });

  it("re-renders every tab's document on reset, keeping each one's session", () => {
    const { panels } = setup();
    panels.openSession("s-1", "a");
    panels.openSession("s-2", "b");
    for (const p of _webviewPanels) p.webview.html = "";
    panels.resetHtml();
    expect(_webviewPanels.map((p) => p.webview.html)).toEqual([
      '<html data-boot="session:s-1"></html>',
      '<html data-boot="session:s-2"></html>',
    ]);
  });

  it("opens one explorer tab, booted as the explorer, and reveals it after", () => {
    const { panels } = setup();
    panels.openExplorer();
    panels.openExplorer();
    expect(_webviewPanels).toHaveLength(1);
    expect(_webviewPanels[0].viewType).toBe(EXPLORER_PANEL_TYPE);
    expect(_webviewPanels[0].title).toBe("Sessions Explorer");
    expect(_webviewPanels[0].webview.html).toBe('<html data-boot="explorer:"></html>');
    expect(_webviewPanels[0].revealed).toBe(1);
  });

  it("keeps the explorer and a session tab apart", () => {
    const { panels } = setup();
    panels.openExplorer();
    panels.openSession("s-1", "a");
    expect(panels.size).toBe(2);
    expect(panels.webviews()).toHaveLength(2);
  });
});
