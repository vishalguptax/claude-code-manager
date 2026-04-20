/**
 * Provides the webview content for the Claude Manager sidebar panel.
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
  getLastParseWarning,
} from "./parser";
import { indexSession, clearIndex, searchContent } from "./searchIndex";
import { slugifyProjectPath } from "./portable";
import { PROJECTS_DIR } from "../../core/config";
import { loadState, pinSession, unpinSession, deleteSession, renameSession } from "./state";
import {
  openProject,
  newSession,
  continueLastSession,
  copyResumeCommand,
  copyMarkdown,
  confirmDeleteSession,
  promptRenameSession,
  resumeSession,
  exportSessionFile,
  importSessionFile,
} from "./commands";
import { getWebviewHtml } from "../../extension/html";
import { getWorkspace } from "../../extension/workspace";
import { getCurrentBranch, onBranchChange } from "../../extension/git";
import {
  isClaudeCodeExtensionInstalled,
  openPromptInExtension,
} from "../../extension/claudeCodeExtension";
import { parseSkills } from "../skills/parser";
import { parseCommands } from "../commands/parser";
import { parseHooks } from "../hooks/parser";
import { parseMcpServers, toggleMcpServer, deleteMcpServer } from "../mcp/parser";
import { parseAgents } from "../agents/parser";
import {
  parseAccountData,
  writeSettingsValue,
  addPermissionEntry,
  removePermissionEntry,
  resolveSettingsPath,
  restoreClaudeJsonFromBackup,
} from "../account/parser";
import { createTerminal } from "../../extension/terminal";
import type { WebviewMessage, Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

/**
 * Provides the webview content for the Claude Manager sidebar panel.
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
  private watchers: vscode.FileSystemWatcher[] = [];
  /** VS Code event subscriptions tied to a single webview lifecycle. */
  private viewSubscriptions: vscode.Disposable[] = [];
  /** Debounce timer for account data re-parse on file changes. */
  private accountReparseTimer: NodeJS.Timeout | undefined;
  /** Debounce timer for session list re-parse on file changes. */
  private sessionsReparseTimer: NodeJS.Timeout | undefined;

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

    // Set up file watchers once per webview lifecycle
    this.setupWatchers();

    // Re-sync workspace path whenever folders change. Without this, switching
    // workspaces or having the workspace resolve after the initial "ready"
    // handshake leaves the webview stuck on a stale (or empty) project name.
    this.viewSubscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.postWorkspacePath();
      }),
    );

    // Also re-post the branch when the user checks out a different ref.
    // Without this the "This Branch" filter would keep pointing at the
    // branch that was active when the panel first opened. We only push
    // the branch (not the full workspace path) so checkouts don't churn
    // the project-name UI.
    this.viewSubscriptions.push(
      onBranchChange(() => {
        const wv = this.view?.webview;
        if (!wv) return;
        wv.postMessage({ type: "workspaceBranch", data: getCurrentBranch() });
      }),
    );

    // Re-push settings when the Claude Code extension gets installed or
    // uninstalled mid-session so the webview's New Chat / Launch-in-Chat
    // affordances appear or disappear without a panel reload.
    this.viewSubscriptions.push(
      vscode.extensions.onDidChange(() => {
        this.refreshSettings();
      }),
    );

    view.onDidDispose(() => {
      // Clear `view` so any pending debounce timers find a null webview and
      // bail instead of posting to a disposed surface.
      this.view = undefined;
      this.disposeWatchers();
      for (const sub of this.viewSubscriptions) sub.dispose();
      this.viewSubscriptions = [];
    });
  }

  /**
   * Monotonic counter for search-index rebuilds. Incremented at the
   * start of each build; chunks bail out if the counter advances
   * during their scheduled gap, which happens when a new parseSessions
   * triggers a rebuild while the previous one is still processing.
   */
  private indexBuildGen = 0;

  /**
   * Build the full-text search index in the background, chunked so the
   * event loop keeps responding to webview events. Called after every
   * parseSessions() so the index stays in sync with the session list.
   *
   * Processes CHUNK sessions per setTimeout tick so a rebuild on a
   * 5000-session collection doesn't block a postMessage sitting behind
   * it. The index is cleared upfront and a stale-generation check on
   * every chunk prevents two overlapping builds from corrupting each
   * other when the file-watcher fires rapidly.
   */
  private buildSearchIndex(): void {
    const myGen = ++this.indexBuildGen;
    const snapshot = this.sessions.slice();
    clearIndex();
    const CHUNK = 50;
    const processChunk = (start: number): void => {
      if (this.view === undefined) return; // webview disposed — abort
      if (this.indexBuildGen !== myGen) return; // superseded by newer build
      for (let i = start; i < Math.min(start + CHUNK, snapshot.length); i++) {
        const s = snapshot[i];
        if (!s.projectPath) continue;
        const slug = slugifyProjectPath(s.projectPath);
        const filePath = path.join(PROJECTS_DIR, slug, s.id + ".jsonl");
        indexSession(s.id, filePath);
      }
      if (start + CHUNK < snapshot.length) {
        setTimeout(() => processChunk(start + CHUNK), 0);
      }
    };
    setTimeout(() => processChunk(0), 0);
  }

  /**
   * Push the current workspace path to the webview. Idempotent — safe to call
   * from multiple lifecycle hooks (initial ready, folder change, session
   * reload). Used as the recovery for the cold-start race where
   * workspace.workspaceFolders is briefly undefined while VS Code initializes.
   */
  private postWorkspacePath(): void {
    const wv = this.view?.webview;
    if (!wv) return;
    wv.postMessage({ type: "workspacePath", data: getWorkspace() });
    // Send the branch alongside so the "This Branch" filter stays in
    // sync with the workspace. Resolving the branch from the Git
    // extension can return an empty string on a cold panel — it is
    // re-sent on every workspace-folder change so the chip eventually
    // appears once the extension activates.
    wv.postMessage({ type: "workspaceBranch", data: getCurrentBranch() });
  }

  /**
   * Push the current settings to the webview. Called from the initial ready
   * handshake and again whenever VS Code settings change so the panel reacts
   * without needing a reload.
   */
  refreshSettings(): void {
    const wv = this.view?.webview;
    if (!wv) return;
    const sessConfig = vscode.workspace.getConfiguration("claudeManager.sessions");
    wv.postMessage({
      type: "settings",
      defaultFilter: sessConfig.get<string>("defaultFilter", "recent"),
      defaultProject: sessConfig.get<string>("defaultProject", "current"),
      restoreWindowMinutes: sessConfig.get<number>("restoreWindowMinutes", 30),
      // Flags the webview uses to conditionally surface extension-only
      // actions (New Chat button, Launch-in-Chat entries). Re-pushed on
      // extension install/uninstall so the UI tracks reality without a
      // panel reload.
      claudeCodeExtensionInstalled: isClaudeCodeExtensionInstalled(),
    });
  }

  /**
   * Watch Claude config/data files and push fresh account data to the webview
   * whenever they change. Uses VS Code's native FileSystemWatcher for efficiency
   * (no polling). Debounces re-parse by 200ms so rapid saves coalesce.
   */
  private setupWatchers(): void {
    this.disposeWatchers();

    // Account-relevant files live in ~/.claude/ and ~/.claude.json.
    // VS Code's createFileSystemWatcher uses native OS file events (no polling).
    //
    // Resolve symlinks: on Windows (and some Linux configs) FileSystemWatcher
    // does not bubble events from the symlink target through the link. Users
    // with dotfile setups often have ~/.claude as a symlink — without this
    // resolve, sessions never refresh until they manually click reload.
    const home = os.homedir();
    let claudeDir = path.join(home, ".claude");
    try {
      claudeDir = fs.realpathSync(claudeDir);
    } catch {
      // Directory doesn't exist yet (brand-new machine) — fall through with
      // the unresolved path so the watcher attaches when Claude creates it.
    }

    const watchPatterns = [
      new vscode.RelativePattern(vscode.Uri.file(home), ".claude.json"),
      new vscode.RelativePattern(
        vscode.Uri.file(claudeDir),
        "{settings.json,stats-cache.json,.credentials.json}",
      ),
    ];

    // Also watch workspace-scoped settings if a workspace is open
    const workspace = getWorkspace();
    if (workspace) {
      watchPatterns.push(
        new vscode.RelativePattern(workspace, ".claude/settings.json"),
        new vscode.RelativePattern(workspace, ".claude/settings.local.json"),
      );
    }

    const onAccountChange = (): void => {
      if (this.accountReparseTimer) clearTimeout(this.accountReparseTimer);
      this.accountReparseTimer = setTimeout(() => {
        const wv = this.view?.webview;
        if (!wv) return;
        try {
          const ws = getWorkspace();
          wv.postMessage({
            type: "accountData",
            data: parseAccountData(ws || undefined),
          });
        } catch (err) {
          console.warn("[claude-manager] account reparse failed:", err);
        }
      }, 200);
    };

    for (const pattern of watchPatterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(onAccountChange);
      watcher.onDidCreate(onAccountChange);
      watcher.onDidDelete(onAccountChange);
      this.watchers.push(watcher);
    }

    // ── Session data watchers ──
    // Watch history.jsonl (new sessions) and all session transcripts
    // (branch changes, message updates). Debounced at 1s since JSONL files
    // are appended to frequently during live sessions — we don't want to
    // hammer the parser on every tool call.
    const sessionWatchPatterns = [
      new vscode.RelativePattern(
        vscode.Uri.file(claudeDir),
        "history.jsonl",
      ),
      new vscode.RelativePattern(
        vscode.Uri.file(path.join(claudeDir, "projects")),
        "**/*.jsonl",
      ),
    ];

    const onSessionChange = (): void => {
      if (this.sessionsReparseTimer) clearTimeout(this.sessionsReparseTimer);
      this.sessionsReparseTimer = setTimeout(() => {
        const wv = this.view?.webview;
        if (!wv) return;
        try {
          this.sessions = parseSessions(loadState().renames);
          // Belt-and-suspenders for the cold-start race: re-post workspace
          // path on every reload so the webview's project filter recovers
          // even if the initial "ready" handshake fired before VS Code
          // resolved its workspace folders.
          this.postWorkspacePath();
          wv.postMessage({
            type: "sessions",
            data: groupSessions(this.sessions),
            stats: getStats(this.sessions),
          });
          wv.postMessage({ type: "projects", data: getUniqueProjects(this.sessions) });
          const warning = getLastParseWarning();
          if (warning) wv.postMessage({ type: "error", message: warning });
          // Keep the search index in sync when sessions change on disk.
          this.buildSearchIndex();
        } catch (err) {
          console.warn("[claude-manager] sessions reparse failed:", err);
        }
      }, 1000);
    };

    for (const pattern of sessionWatchPatterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(onSessionChange);
      watcher.onDidCreate(onSessionChange);
      watcher.onDidDelete(onSessionChange);
      this.watchers.push(watcher);
    }
  }

  private disposeWatchers(): void {
    if (this.accountReparseTimer) clearTimeout(this.accountReparseTimer);
    this.accountReparseTimer = undefined;
    if (this.sessionsReparseTimer) clearTimeout(this.sessionsReparseTimer);
    this.sessionsReparseTimer = undefined;
    for (const w of this.watchers) w.dispose();
    this.watchers = [];
  }

  private async onMessage(msg: WebviewMessage): Promise<void> {
    const wv = this.view?.webview;
    if (!wv) {
      return;
    }

    try {
    switch (msg.type) {
      case "ready": {
        this.sessions = parseSessions(loadState().renames);
        this.postWorkspacePath();
        this.refreshSettings();
        wv.postMessage({ type: "sessions", data: groupSessions(this.sessions), stats: getStats(this.sessions) });
        wv.postMessage({ type: "projects", data: getUniqueProjects(this.sessions) });
        wv.postMessage({ type: "userState", ...loadState() });
        const warning = getLastParseWarning();
        if (warning) wv.postMessage({ type: "error", message: warning });
        // Kick off the full-text index in the background — the webview
        // has its data already, this runs behind the user's first view.
        this.buildSearchIndex();
        break;
      }

      case "getSessionDetail": {
        const mode = (msg as { mode?: "first" | "last" }).mode ?? "last";
        const detail = parseSessionDetail(
          msg.sessionId,
          this.sessions.find((s) => s.id === msg.sessionId),
          mode,
        );
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
        this.buildSearchIndex();
        break;

      case "searchFullText": {
        // Transcript content search runs synchronously on the pre-built
        // lowercased index. The reply carries the echo-query so the webview
        // can drop stale results if the user has since typed more.
        const ids = searchContent(msg.query);
        wv.postMessage({ type: "fullTextResults", query: msg.query, ids });
        break;
      }

      case "launchNewChat": {
        // Bare extension chat tab. The button that posts this message is
        // only rendered when the extension is installed, so no fallback
        // is needed — but we still silently no-op instead of erroring if
        // the extension somehow vanished between render and click.
        if (isClaudeCodeExtensionInstalled()) {
          await openPromptInExtension("");
        }
        break;
      }

      case "launchChatWithPrompt": {
        if (isClaudeCodeExtensionInstalled()) {
          await openPromptInExtension(msg.prompt);
        }
        break;
      }

      case "openProjectAndChat": {
        // The URI handler is workspace-scoped, so we have to open the
        // target project first and then fire the URI. VS Code opens the
        // new window asynchronously — a short delay lets the Claude
        // Code extension finish activating in the new window before the
        // URI is dispatched. Without the delay the chat tab opens but
        // the extension may not yet have registered its handler.
        openProject(msg.projectPath);
        if (isClaudeCodeExtensionInstalled()) {
          setTimeout(() => openPromptInExtension(""), 1500);
        }
        break;
      }

      case "openProject":
        openProject(msg.projectPath);
        break;

      case "newSession":
        newSession();
        break;

      case "continueLastSession":
        continueLastSession();
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
        // Sequential with a short delay between iterations: VS Code
        // registers a new terminal's tab in tabGroups.all asynchronously,
        // so calling createTerminal() in a tight loop made the second
        // and later terminals see an empty tab list and open in fresh
        // editor groups. The 80ms gap gives VS Code's event loop a tick
        // to register the previous tab before findExistingTerminalColumn
        // runs again — the result is all restored terminals stacked as
        // tabs in a single editor group instead of N split panels.
        for (let i = 0; i < msg.sessionIds.length; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 80));
          await resumeSession(msg.sessionIds[i], false, this.sessions);
        }
        break;

      case "copyMarkdown":
        copyMarkdown(msg.sessionId, this.sessions);
        break;

      case "exportSession":
        await exportSessionFile(msg.sessionId, this.sessions);
        break;

      case "importSession":
        await importSessionFile(this.sessions, () => {
          // Re-parse so the imported session shows up in the list. We
          // route through the existing reload path instead of duplicating
          // the message-build logic — this also re-posts workspace path
          // and surfaces any schema-drift warning.
          this.sessions = parseSessions(loadState().renames);
          const wv2 = this.view?.webview;
          if (!wv2) return;
          this.postWorkspacePath();
          wv2.postMessage({
            type: "sessions",
            data: groupSessions(this.sessions),
            stats: getStats(this.sessions),
          });
          wv2.postMessage({ type: "projects", data: getUniqueProjects(this.sessions) });
          this.buildSearchIndex();
        });
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

      case "openExtensionSettings": {
        vscode.commands.executeCommand("workbench.action.openSettings", "claudeManager");
        break;
      }

      // ── Account messages ──

      case "getAccountData": {
        const workspace = getWorkspace();
        const data = parseAccountData(workspace || undefined);
        wv.postMessage({ type: "accountData", data });
        break;
      }

      case "openAccountUrl": {
        vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      }

      case "launchSlash": {
        // Slash commands (/login, /logout, /config, etc.) must be typed inside
        // a running Claude REPL. There's no CLI arg form that works — passing
        // them directly either gets swallowed by the shell (Git Bash path
        // mangling) or treated as an initial prompt by Claude.
        //
        // Strategy: open a terminal, run `claude`, wait for Claude to switch
        // to raw terminal mode (~1800ms — long enough for most machines),
        // then send the slash command. Shows a notification as a safety net
        // in case the auto-type misses due to slow startup.
        const command = msg.command;
        const term = createTerminal(`Claude: ${command}`);
        term.show();
        term.sendText("claude");
        setTimeout(() => term.sendText(command), 1800);
        vscode.window.showInformationMessage(
          `Opening ${command}. If it doesn't auto-enter, type ${command} manually in the Claude terminal.`,
        );
        break;
      }

      case "setModel": {
        writeSettingsValue("model", msg.model || undefined);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "promptCustomModel": {
        const input = await vscode.window.showInputBox({
          title: "Custom model",
          prompt: "Enter a model alias (e.g. opus) or full ID (e.g. claude-opus-4-7)",
          placeHolder: "claude-opus-4-7",
          validateInput: (v: string) => (v.trim() ? null : "Model name cannot be empty"),
        });
        if (input && input.trim()) {
          writeSettingsValue("model", input.trim());
          const workspace = getWorkspace();
          wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        }
        break;
      }

      case "restoreClaudeConfig": {
        // Confirm with the user before overwriting anything.
        const confirm = await vscode.window.showWarningMessage(
          "Restore Claude config from the latest backup?",
          {
            modal: true,
            detail:
              "Your ~/.claude.json is empty or invalid. Claude Manager can copy the most recent backup from ~/.claude/backups over it, which preserves your account and settings so Claude CLI doesn't prompt to reset or re-login.",
          },
          "Restore",
        );
        if (confirm !== "Restore") break;
        const restoredFrom = restoreClaudeJsonFromBackup();
        if (restoredFrom) {
          vscode.window.showInformationMessage(
            `Restored ~/.claude.json from backup (${path.basename(restoredFrom)}).`,
          );
          const workspace = getWorkspace();
          wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        } else {
          vscode.window.showErrorMessage(
            "No valid backup found in ~/.claude/backups. You may need to re-run Claude to regenerate the config.",
          );
        }
        break;
      }

      case "setVoiceEnabled": {
        writeSettingsValue("voiceEnabled", msg.value);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "setCommitAttribution": {
        writeSettingsValue("attribution.commit", msg.value);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "setPrAttribution": {
        writeSettingsValue("attribution.pr", msg.value);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "openSettingsFile": {
        const workspace = getWorkspace();
        const filePath = resolveSettingsPath(msg.scope, workspace || undefined);
        if (!filePath) {
          vscode.window.showErrorMessage(
            msg.scope === "global" ? "Could not resolve settings path" : "No workspace folder open",
          );
          break;
        }
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showErrorMessage(`Could not open ${filePath}`);
        }
        break;
      }

      case "addPermission": {
        const workspace = getWorkspace();
        addPermissionEntry(msg.scope, msg.tool, msg.list, workspace || undefined);
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "promptAddPermission": {
        const workspace = getWorkspace();
        const scope = msg.scope;
        const list = msg.list;

        // Known built-in tool names users can pick from
        const BUILTIN_TOOLS = [
          "Bash(*)",
          "Bash(git:*)",
          "Bash(git push:*)",
          "Bash(npm:*)",
          "Bash(rm:*)",
          "Read",
          "Edit",
          "Write",
          "Glob",
          "Grep",
          "WebSearch",
          "WebFetch",
          "NotebookEdit",
        ];

        // Discover MCP tools from the current mcpServers cache
        const mcpTools = this.mcpServers.map((s) => `mcp__${s.name}__*`);

        const items = [
          ...BUILTIN_TOOLS.map((t) => ({ label: t, description: "built-in" })),
          ...mcpTools.map((t) => ({ label: t, description: "MCP" })),
          { label: "$(edit) Custom pattern…", description: "Enter your own tool pattern" },
        ];

        const pick = await vscode.window.showQuickPick(items, {
          title: `Add ${list === "allow" ? "allowed" : "denied"} tool to ${scope} scope`,
          placeHolder: "Pick a tool or enter a custom pattern",
          matchOnDescription: true,
        });
        if (!pick) break;

        let tool: string | undefined;
        if (pick.label.startsWith("$(edit)")) {
          tool = await vscode.window.showInputBox({
            title: "Custom tool pattern",
            prompt: "Examples: Bash(docker:*), Bash(curl:*), mcp__github__*",
            placeHolder: "Bash(command:*)",
            validateInput: (v: string) => (v.trim() ? null : "Tool pattern cannot be empty"),
          });
        } else {
          tool = pick.label;
        }

        if (tool && tool.trim()) {
          addPermissionEntry(scope, tool.trim(), list, workspace || undefined);
          wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        }
        break;
      }

      case "removePermission": {
        const workspace = getWorkspace();
        removePermissionEntry(msg.scope, msg.tool, msg.list, workspace || undefined);
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
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
