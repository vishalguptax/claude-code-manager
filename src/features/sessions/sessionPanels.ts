/**
 * Sessions in editor tabs: one session's detail given the editor's full
 * width, or the explorer — folders, the whole session list and a detail
 * pane side by side, for organizing at scale.
 *
 * A tab is one more webview on the provider's broadcast, not a second
 * host: it shares the provider's session cache, watchers and dispatch, so a
 * pin, rename or move made anywhere shows everywhere. This module only owns
 * the tabs themselves — creating, revealing and tracking them.
 */
import * as vscode from "vscode";
import { getWebviewHtml, type WebviewBoot } from "../../extension/html";
import type { WebviewMessage } from "./types";

/** View type of a session tab. Not a contributed view; only a tab id. */
export const SESSION_PANEL_TYPE = "claudeManager.sessionDetail";
/** View type of the explorer tab. */
export const EXPLORER_PANEL_TYPE = "claudeManager.sessionsExplorer";

/** Editor tabs truncate long titles anyway; past this they only crowd. */
const MAX_TITLE = 40;

export interface SessionPanelsDeps {
  readonly extensionUri: vscode.Uri;
  /** Route a message from any tab into the provider's dispatch. */
  onMessage(msg: WebviewMessage): void;
  /** Called after a tab opens or closes, so the provider can re-target its broadcast. */
  onChange(): void;
  /** Called whenever a tab's visibility changes. */
  onVisibilityChange(): void;
}

export interface SessionPanels {
  /** Open the session in a tab, or reveal the tab it already has. */
  openSession(sessionId: string, title: string): void;
  /** Open the explorer, or reveal it — there is only ever one. */
  openExplorer(): void;
  webviews(): vscode.Webview[];
  anyVisible(): boolean;
  readonly size: number;
  /** Re-render every tab's document (the global reload). */
  resetHtml(): void;
}

/** A tab title from the session's display name. */
export function panelTitle(name: string): string {
  const flat = name.replace(/\s+/g, " ").trim() || "Session";
  return flat.length > MAX_TITLE ? `${flat.slice(0, MAX_TITLE - 1)}…` : flat;
}

interface OpenTab {
  panel: vscode.WebviewPanel;
  boot: WebviewBoot;
}

export function createSessionPanels(deps: SessionPanelsDeps): SessionPanels {
  /** Keyed `session:<id>` or `explorer`, so reopening reveals instead of duplicating. */
  const tabs = new Map<string, OpenTab>();
  const render = ({ panel, boot }: OpenTab): void => {
    panel.webview.html = getWebviewHtml(panel.webview, deps.extensionUri, boot);
  };

  const open = (key: string, viewType: string, title: string, boot: WebviewBoot): void => {
    const existing = tabs.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Active, {
      enableScripts: true,
      // Cmd/Ctrl+F across the rendered transcript, on top of the view's own
      // search (which reaches messages not yet loaded).
      enableFindWidget: true,
      localResourceRoots: [vscode.Uri.joinPath(deps.extensionUri, "dist", "webview")],
    });
    panel.iconPath = vscode.Uri.joinPath(deps.extensionUri, "media", "icon.svg");
    const tab = { panel, boot };
    render(tab);
    panel.webview.onDidReceiveMessage((msg: WebviewMessage) => deps.onMessage(msg));
    panel.onDidChangeViewState(() => deps.onVisibilityChange());
    panel.onDidDispose(() => {
      tabs.delete(key);
      deps.onChange();
    });
    tabs.set(key, tab);
    deps.onChange();
  };

  return {
    openSession(sessionId, title) {
      open(`session:${sessionId}`, SESSION_PANEL_TYPE, panelTitle(title), {
        view: "session",
        sessionId,
      });
    },
    openExplorer() {
      open("explorer", EXPLORER_PANEL_TYPE, "Sessions Explorer", { view: "explorer" });
    },
    webviews() {
      return [...tabs.values()].map((t) => t.panel.webview);
    },
    anyVisible() {
      for (const t of tabs.values()) if (t.panel.visible) return true;
      return false;
    },
    get size() {
      return tabs.size;
    },
    resetHtml() {
      for (const tab of tabs.values()) render(tab);
    },
  };
}
