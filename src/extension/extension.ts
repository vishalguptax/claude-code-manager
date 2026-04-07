import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  parseSessions,
  parseSessionDetail,
  groupSessions,
  getStats,
  getUniqueProjects,
  searchSessions,
  filterSessions,
} from "./sessionParser";
import { WebviewMessage, Session } from "./types";

class ClaudeSessionViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _sessions: Session[] = [];

  constructor(private readonly _extUri: vscode.Uri) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this._view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extUri, "dist", "webview")],
    };
    view.webview.html = getWebviewHtml(view.webview, this._extUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => this._onMessage(msg));
  }

  private async _onMessage(msg: WebviewMessage) {
    const wv = this._view?.webview;
    if (!wv) return;

    switch (msg.type) {
      case "ready":
        this._sessions = parseSessions();
        wv.postMessage({ type: "workspacePath", data: getWs() });
        wv.postMessage({ type: "sessions", data: groupSessions(this._sessions), stats: getStats(this._sessions) });
        wv.postMessage({ type: "projects", data: getUniqueProjects(this._sessions) });
        wv.postMessage({ type: "userState", ...loadState() });
        break;

      case "getSessionDetail": {
        const d = parseSessionDetail(msg.sessionId, this._sessions.find((s) => s.id === msg.sessionId));
        if (d) wv.postMessage({ type: "sessionDetail", data: d });
        break;
      }

      case "search": {
        const f = msg.query ? searchSessions(this._sessions, msg.query) : this._sessions;
        wv.postMessage({ type: "sessions", data: groupSessions(f), stats: getStats(f) });
        break;
      }

      case "filter": {
        const f = filterSessions(this._sessions, { project: msg.project, branch: msg.branch, dateRange: msg.dateRange });
        wv.postMessage({ type: "sessions", data: groupSessions(f), stats: getStats(f) });
        break;
      }

      case "refresh":
        this._sessions = parseSessions();
        wv.postMessage({ type: "sessions", data: groupSessions(this._sessions), stats: getStats(this._sessions) });
        break;

      case "openProject":
        vscode.commands.executeCommand(
          "vscode.openFolder",
          vscode.Uri.file(msg.projectPath),
          { forceNewWindow: true }
        );
        break;

      case "newSession":
        mkTerminal("Claude").sendText("claude");
        break;

      case "forkSession":
        this._doResume(msg.sessionId, true);
        break;

      case "pinSession": {
        const state = loadState();
        if (!state.pinned.includes(msg.sessionId)) state.pinned.push(msg.sessionId);
        saveState(state);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "unpinSession": {
        const state = loadState();
        state.pinned = state.pinned.filter((id: string) => id !== msg.sessionId);
        saveState(state);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "deleteSession": {
        const state = loadState();
        if (!state.deleted.includes(msg.sessionId)) state.deleted.push(msg.sessionId);
        state.pinned = state.pinned.filter((id: string) => id !== msg.sessionId);
        saveState(state);
        wv.postMessage({ type: "userState", ...state });
        break;
      }

      case "confirmDelete": {
        const choice = await vscode.window.showWarningMessage(
          "Delete this session from the list?",
          { modal: true, detail: "This will hide the session from your list. Claude's original data won't be modified." },
          "Delete"
        );
        if (choice === "Delete") {
          const st = loadState();
          if (!st.deleted.includes(msg.sessionId)) st.deleted.push(msg.sessionId);
          st.pinned = st.pinned.filter((id: string) => id !== msg.sessionId);
          saveState(st);
          wv.postMessage({ type: "userState", ...st });
          if (msg.callback === "showList") wv.postMessage({ type: "navigateList" });
        }
        break;
      }

      case "copyCommand":
        vscode.env.clipboard.writeText(`claude --resume ${msg.sessionId}`);
        vscode.window.showInformationMessage(`Copied: claude --resume ${msg.sessionId}`);
        break;

      case "resumeSession":
        this._doResume(msg.sessionId, false);
        break;

      case "resumeMultiple":
        for (const sid of msg.sessionIds) this._doResume(sid, false);
        break;

      case "copyMarkdown": {
        const sess = this._sessions.find((s) => s.id === msg.sessionId);
        const d = parseSessionDetail(msg.sessionId, sess);
        if (d) {
          vscode.env.clipboard.writeText(
            d.messages.map((m) => `## ${m.role === "user" ? "You" : "Claude"}\n\n${m.content}`).join("\n\n---\n\n")
          );
          vscode.window.showInformationMessage("Copied as Markdown");
        }
        break;
      }

      case "openUrl":
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
    }
  }

  private async _doResume(sessionId: string, fork: boolean) {
    const sess = this._sessions.find((s) => s.id === sessionId);
    const cwd = sess?.projectPath || "";
    const sessBranch = sess?.branch || "";
    const cmd = fork
      ? `claude --resume ${sessionId} --fork-session`
      : `claude --resume ${sessionId}`;
    const ws = getWs();

    // Different project — open that project window
    if (ws && cwd && norm(cwd) !== norm(ws)) {
      vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(cwd),
        { forceNewWindow: true }
      );
      return;
    }

    // Same project or no workspace — check branch before resuming
    if (sessBranch && sessBranch !== "HEAD") {
      const currentBranch = getCurrentBranch();
      if (currentBranch && currentBranch !== sessBranch) {
        const choice = await vscode.window.showWarningMessage(
          `This session was on branch "${sessBranch}", but you're on "${currentBranch}".`,
          { modal: true, detail: "The session may not work correctly on a different branch." },
          "Switch & Resume",
          "Resume Anyway"
        );
        if (choice === "Cancel" || !choice) return;
        if (choice === "Switch & Resume") {
          const term = mkTerminal(`Claude: ${sessionId.slice(0, 8)}`, cwd);
          term.sendText(`git checkout "${sessBranch}" && ${cmd}`);
          return;
        }
        // "Resume Anyway" falls through
      }
    }

    mkTerminal(`Claude: ${sessionId.slice(0, 8)}`, cwd).sendText(cmd);
  }
}

// ── State (pin/delete) ──

const STATE_FILE = path.join(os.homedir(), ".claude", ".csm-state.json");

function loadState(): { pinned: string[]; deleted: string[] } {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return { pinned: data.pinned || [], deleted: data.deleted || [] };
    }
  } catch { /* ignore */ }
  return { pinned: [], deleted: [] };
}

function saveState(state: { pinned: string[]; deleted: string[] }) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

// ── Git ──

function getCurrentBranch(): string {
  try {
    const gitExt = vscode.extensions.getExtension<{ getAPI(version: number): any }>("vscode.git");
    if (!gitExt?.isActive) return "";
    const git = gitExt.exports.getAPI(1);
    const repo = git.repositories[0];
    return repo?.state?.HEAD?.name || "";
  } catch {
    return "";
  }
}

// ── Utilities ──

function mkTerminal(name: string, cwd?: string): vscode.Terminal {
  return vscode.window.createTerminal({
    name,
    cwd: cwd || undefined,
    location: { viewColumn: vscode.ViewColumn.Beside },
  });
}

function getWs(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
}

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function getNonce(): string {
  let t = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}

function getWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  const js = webview.asWebviewUri(vscode.Uri.joinPath(extUri, "dist", "webview", "main.js"));
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extUri, "dist", "webview", "styles.css"));
  const n = getNonce();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}';"><link rel="stylesheet" href="${css}"><style>:root{--bg:var(--vscode-sideBar-background,var(--vscode-editor-background));--bg-hover:var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));--bg-active:var(--vscode-list-activeSelectionBackground);--bg-active-fg:var(--vscode-list-activeSelectionForeground);--fg:var(--vscode-sideBar-foreground,var(--vscode-editor-foreground));--fg-dim:var(--vscode-descriptionForeground);--fg-muted:var(--vscode-disabledForeground);--border:var(--vscode-sideBarSectionHeader-border,var(--vscode-panel-border));--accent:var(--vscode-focusBorder);--badge-bg:var(--vscode-badge-background);--badge-fg:var(--vscode-badge-foreground);--input-bg:var(--vscode-input-background);--input-border:var(--vscode-input-border,transparent);--input-fg:var(--vscode-input-foreground);--btn-bg:var(--vscode-button-background);--btn-fg:var(--vscode-button-foreground);--btn-hover:var(--vscode-button-hoverBackground);--link:var(--vscode-textLink-foreground);--green:#2ea043;--green-bg:rgba(46,160,67,0.15);--red:var(--vscode-errorForeground,#f85149);--red-bg:rgba(248,81,73,0.15);--mono:var(--vscode-editor-font-family,monospace);--shadow:rgba(0,0,0,0.25);--overlay-hover:rgba(255,255,255,0.08);--dropdown-bg:var(--vscode-dropdown-background,var(--input-bg));--dropdown-border:var(--vscode-dropdown-border,var(--border));--menu-bg:var(--vscode-menu-background,var(--input-bg));--menu-border:var(--vscode-menu-border,var(--border));--menu-fg:var(--vscode-menu-foreground,var(--fg));--fs-xs:10px;--fs-sm:11px;--fs-base:12px;--fs-md:13px;--fs-lg:14px;--fs-xl:16px;--radius-sm:3px;--radius:4px;--radius-md:5px;--radius-lg:6px;--space-xs:4px;--space-sm:6px;--space-md:8px;--space-lg:10px;--space-xl:12px;--space-2xl:14px}*{margin:0;padding:0;box-sizing:border-box}body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size,13px);background:var(--bg);color:var(--fg);height:100vh;overflow:hidden}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:3px}#root{height:100vh}</style></head><body><div id="root"></div><script nonce="${n}" src="${js}"></script></body></html>`;
}

// ── Activation ──

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "claudeCodeManager.view",
      new ClaudeSessionViewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.open", () => {
      vscode.commands.executeCommand("claudeCodeManager.view.focus");
    })
  );
}

export function deactivate() {}
