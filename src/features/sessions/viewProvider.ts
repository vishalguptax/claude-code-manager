/**
 * Provides the webview content for the Claude Code Manager sidebar panel.
 * Handles all message passing between the webview UI and the extension host.
 */
import * as vscode from "vscode";
import {
  parseSessions,
  parseSessionDetail,
  groupSessions,
  getStats,
  getUniqueProjects,
  searchSessions,
  filterSessions,
} from "./parser";
import { loadState, pinSession, unpinSession, deleteSession } from "./state";
import {
  openProject,
  newSession,
  copyResumeCommand,
  copyMarkdown,
  confirmDeleteSession,
  resumeSession,
} from "./commands";
import { getWebviewHtml } from "../../extension/html";
import { getWorkspace } from "../../extension/workspace";
import type { WebviewMessage, Session } from "./types";

/**
 * Provides the webview content for the Claude Code Manager sidebar panel.
 * Handles all message passing between the webview UI and the extension host.
 */
export class ClaudeSessionViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private sessions: Session[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  /** Called by VS Code when the webview view becomes visible. */
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => this.onMessage(msg));
  }

  private async onMessage(msg: WebviewMessage): Promise<void> {
    const wv = this.view?.webview;
    if (!wv) {
      return;
    }

    switch (msg.type) {
      case "ready":
        this.sessions = parseSessions();
        wv.postMessage({ type: "workspacePath", data: getWorkspace() });
        wv.postMessage({ type: "sessions", data: groupSessions(this.sessions), stats: getStats(this.sessions) });
        wv.postMessage({ type: "projects", data: getUniqueProjects(this.sessions) });
        wv.postMessage({ type: "userState", ...loadState() });
        break;

      case "getSessionDetail": {
        const detail = parseSessionDetail(msg.sessionId, this.sessions.find((s) => s.id === msg.sessionId));
        if (detail) {
          wv.postMessage({ type: "sessionDetail", data: detail });
        }
        break;
      }

      case "search": {
        const filtered = msg.query ? searchSessions(this.sessions, msg.query) : this.sessions;
        wv.postMessage({ type: "sessions", data: groupSessions(filtered), stats: getStats(filtered) });
        break;
      }

      case "filter": {
        const filtered = filterSessions(this.sessions, {
          project: msg.project,
          branch: msg.branch,
          dateRange: msg.dateRange,
        });
        wv.postMessage({ type: "sessions", data: groupSessions(filtered), stats: getStats(filtered) });
        break;
      }

      case "refresh":
        this.sessions = parseSessions();
        wv.postMessage({ type: "sessions", data: groupSessions(this.sessions), stats: getStats(this.sessions) });
        break;

      case "openProject":
        openProject(msg.projectPath);
        break;

      case "newSession":
        newSession();
        break;

      case "forkSession":
        await resumeSession(msg.sessionId, true, this.sessions);
        break;

      case "pinSession": {
        const state = pinSession(msg.sessionId);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "unpinSession": {
        const state = unpinSession(msg.sessionId);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "deleteSession": {
        const state = deleteSession(msg.sessionId);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "confirmDelete": {
        const result = await confirmDeleteSession(msg.sessionId, msg.callback);
        if (result) {
          wv.postMessage({ type: "userState", pinned: result.pinned, deleted: result.deleted });
          if (result.navigateToList) {
            wv.postMessage({ type: "navigateList" });
          }
        }
        break;
      }

      case "copyCommand":
        copyResumeCommand(msg.sessionId);
        break;

      case "resumeSession":
        await resumeSession(msg.sessionId, false, this.sessions);
        break;

      case "resumeMultiple":
        for (const sid of msg.sessionIds) {
          await resumeSession(sid, false, this.sessions);
        }
        break;

      case "copyMarkdown":
        copyMarkdown(msg.sessionId, this.sessions);
        break;

      case "openUrl":
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
    }
  }
}
