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
import { loadState, pinSession, unpinSession, deleteSession, renameSession } from "./state";
import {
  openProject,
  newSession,
  copyResumeCommand,
  copyMarkdown,
  confirmDeleteSession,
  promptRenameSession,
  resumeSession,
} from "./commands";
import { getWebviewHtml } from "../../extension/html";
import { getWorkspace } from "../../extension/workspace";
import { parseSkills } from "../skills/parser";
import { parseCommands } from "../commands/parser";
import { parseHooks } from "../hooks/parser";
import { parseMcpServers, toggleMcpServer, deleteMcpServer } from "../mcp/parser";
import { parseAgents } from "../agents/parser";
import type { WebviewMessage, Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";
import * as path from "path";

/**
 * Provides the webview content for the Claude Code Manager sidebar panel.
 * Handles all message passing between the webview UI and the extension host.
 */
export class ClaudeSessionViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private sessions: Session[] = [];
  private skills: Skill[] = [];
  private commands: Command[] = [];
  private hooks: Hook[] = [];
  private mcpServers: McpServer[] = [];
  private agents: Agent[] = [];

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

    try {
    switch (msg.type) {
      case "ready":
        this.sessions = parseSessions(loadState().renames);
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
        this.sessions = parseSessions(loadState().renames);
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
          wv.postMessage({
            type: "userState",
            pinned: result.pinned,
            deleted: result.deleted,
            renames: loadState().renames,
          });
          if (result.navigateToList) {
            wv.postMessage({ type: "navigateList" });
          }
        }
        break;
      }

      case "renameSession": {
        const newName = await promptRenameSession(msg.sessionId, this.sessions);
        if (newName !== null) {
          const state = renameSession(msg.sessionId, newName);
          // Update cached session in-place instead of re-parsing all from disk
          const target = this.sessions.find((s) => s.id === msg.sessionId);
          if (target) target.name = newName.trim();
          wv.postMessage({ type: "sessions", data: groupSessions(this.sessions), stats: getStats(this.sessions) });
          wv.postMessage({ type: "userState", ...state });
          // Refresh detail view if showing this session
          if (target) {
            const updated = parseSessionDetail(msg.sessionId, target);
            if (updated) wv.postMessage({ type: "sessionDetail", data: updated });
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

      // ── Skills messages ──

      case "getSkills": {
        const workspace = getWorkspace();
        this.skills = parseSkills(workspace || undefined);
        wv.postMessage({ type: "skills", data: this.skills });
        break;
      }

      case "getSkillDetail": {
        const skill = this.skills.find((s) => s.id === (msg as { type: string; skillId: string }).skillId);
        if (skill) {
          wv.postMessage({ type: "skillDetail", data: skill });
        }
        break;
      }

      case "openSkillFile": {
        const skillPath = (msg as { type: string; skillPath: string }).skillPath;
        const skillFile = path.join(skillPath, "SKILL.md");
        try {
          const doc = await vscode.workspace.openTextDocument(skillFile);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${skillFile}`);
        }
        break;
      }

      case "deleteSkill": {
        const skillPath = (msg as { type: string; skillPath: string }).skillPath;
        const choice = await vscode.window.showWarningMessage(
          `Delete this skill folder?`,
          {
            modal: true,
            detail: `This will permanently delete:\n${skillPath}`,
          },
          "Delete",
        );
        if (choice === "Delete") {
          try {
            const fsExtra = await import("fs");
            fsExtra.rmSync(skillPath, { recursive: true, force: true });
            const workspace = getWorkspace();
            this.skills = parseSkills(workspace || undefined);
            wv.postMessage({ type: "skills", data: this.skills });
          } catch (err) {
            vscode.window.showErrorMessage(`Failed to delete: ${(err as Error).message}`);
          }
        }
        break;
      }

      // ── Commands messages ──

      case "getCommands": {
        const workspace = getWorkspace();
        this.commands = parseCommands(workspace || undefined);
        wv.postMessage({ type: "commands", data: this.commands });
        break;
      }

      case "openCommandFile": {
        const cmdPath = (msg as { type: string; path: string }).path;
        try {
          const doc = await vscode.workspace.openTextDocument(cmdPath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${cmdPath}`);
        }
        break;
      }

      // ── Hooks messages ──

      case "getHooks": {
        this.hooks = parseHooks(getWorkspace());
        wv.postMessage({ type: "hooks", data: this.hooks });
        break;
      }

      // ── MCP messages ──

      case "getMcpServers": {
        const workspace = getWorkspace();
        this.mcpServers = parseMcpServers(workspace || undefined);
        wv.postMessage({ type: "mcpServers", data: this.mcpServers });
        break;
      }

      case "openMcpConfig": {
        const scope = (msg as { type: string; scope: string }).scope;
        let configPath: string;
        if (scope === "project") {
          const workspace = getWorkspace();
          if (!workspace) {
            vscode.window.showErrorMessage("No workspace folder open");
            break;
          }
          configPath = path.join(workspace, ".mcp.json");
        } else {
          const os = await import("os");
          configPath = path.join(os.homedir(), ".claude", "mcp.json");
        }
        try {
          const doc = await vscode.workspace.openTextDocument(configPath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${configPath}`);
        }
        break;
      }

      case "toggleMcpServer": {
        const { name, scope, disabled } = msg as { type: string; name: string; scope: "global" | "project"; disabled: boolean };
        const workspace = getWorkspace();
        const ok = toggleMcpServer(name, scope, disabled, workspace || undefined);
        if (ok) {
          // Re-parse and push updated list
          this.mcpServers = parseMcpServers(workspace || undefined);
          wv.postMessage({ type: "mcpServers", data: this.mcpServers });
        } else {
          vscode.window.showErrorMessage(`Failed to ${disabled ? "disable" : "enable"} ${name}`);
        }
        break;
      }

      case "deleteMcpServer": {
        const { name: srvName, scope: srvScope } = msg as { type: string; name: string; scope: "global" | "project" };
        const choice = await vscode.window.showWarningMessage(
          `Delete MCP server "${srvName}"?`,
          {
            modal: true,
            detail: `This will remove the server entry from your ${srvScope} .mcp.json config.`,
          },
          "Delete",
        );
        if (choice === "Delete") {
          const workspace = getWorkspace();
          const ok = deleteMcpServer(srvName, srvScope, workspace || undefined);
          if (ok) {
            this.mcpServers = parseMcpServers(workspace || undefined);
            wv.postMessage({ type: "mcpServers", data: this.mcpServers });
          } else {
            vscode.window.showErrorMessage(`Failed to delete ${srvName}`);
          }
        }
        break;
      }

      // ── Agents messages ──

      case "getAgents": {
        const workspace = getWorkspace();
        this.agents = parseAgents(workspace || undefined);
        wv.postMessage({ type: "agents", data: this.agents });
        break;
      }

      case "openAgentFile": {
        const agentPath = (msg as { type: string; path: string }).path;
        try {
          const doc = await vscode.workspace.openTextDocument(agentPath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${agentPath}`);
        }
        break;
      }

      // ── Generic file open ──

      case "openFile": {
        const filePath = (msg as { type: string; path: string }).path;
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${filePath}`);
        }
        break;
      }
    }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[claude-manager] Message handler error (${msg.type}):`, message);
      wv.postMessage({ type: "error", message: `Internal error: ${message}` });
    }
  }
}
