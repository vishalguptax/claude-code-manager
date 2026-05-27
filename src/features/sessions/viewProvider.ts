/**
 * Provides the webview content for the Claude Manager sidebar panel and
 * wires the host side together: lifecycle, the webview HTML shell, the
 * file-watcher fleet (watchers.ts), the process-death poll (liveState.ts),
 * and the webview-message dispatch (messageHandlers.ts).
 *
 * The provider owns the cached feature lists and a handful of mutable
 * lifecycle fields, exposed to the extracted modules through the context
 * interfaces it implements. Everything heavier — data reloads, the search
 * index rebuild, the account switcher, the identity / backup observers —
 * lives in providerActions.ts and accountSwitcher.ts so this file stays a
 * thin coordinator.
 */
import * as vscode from "vscode";
import { getWebviewHtml } from "../../extension/html";
import { getCurrentBranch, onBranchChange } from "../../extension/git";
import type { AccountData } from "../account/types";
import { dispatch } from "./messageHandlers";
import { type HostContext } from "./hostContext";
import { createWatchers, type WatcherContext } from "./watchers";
import { createLivePoll, type LivePoll } from "./liveState";
import { openAccountSwitcher } from "./accountSwitcher";
import {
  reloadAll,
  refreshSettings,
  postWorkspacePath,
  refreshLiveState,
  buildSearchIndex,
  checkForIdentityChange,
  sweepSwitchBackups,
  type ProviderActionsContext,
} from "./providerActions";
import type { WebviewMessage, Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";

/**
 * Provides the webview content for the Claude Manager sidebar panel.
 * Handles all message passing between the webview UI and the extension host.
 */
export class ClaudeSessionViewProvider
  implements vscode.WebviewViewProvider, HostContext, WatcherContext, ProviderActionsContext
{
  private view?: vscode.WebviewView;
  private sessions: Session[] = [];
  private skills: Skill[] = [];
  private commands: Command[] = [];
  private hooks: Hook[] = [];
  private mcpServers: McpServer[] = [];
  private agents: Agent[] = [];
  /** Active file-watcher fleet, disposed with the webview. */
  private watcherHandle: vscode.Disposable | undefined;
  /** VS Code event subscriptions tied to a single webview lifecycle. */
  private viewSubscriptions: vscode.Disposable[] = [];
  /** Debounce timer for live-state refresh (PID watcher + sibling-sync nudge). */
  private liveStateRefreshTimer: NodeJS.Timeout | undefined;
  /**
   * Process-death poller. FileSystemWatcher never fires when a CLI
   * process dies hard, so we re-check liveness on a slow tick. Paused
   * while the webview is hidden to avoid spending CPU on UI no one sees.
   */
  private readonly livePoll: LivePoll = createLivePoll(() => this.refreshLiveState());
  /**
   * Last observed live identity. null = never parsed; "" = signed out;
   * "abc…" = signed in. Used by the account watcher to spot /login
   * /logout cycles. Seeded on first parse so initial load doesn't fire a
   * false-positive toast.
   */
  private lastSeenIdentity: string | null = null;
  /** Single in-flight identity-change toast (anti-stacking gate). */
  private identityToastPending = false;
  /** Last workspace path posted — compare-then-post to avoid churn. */
  private lastPostedWorkspace: string | undefined = undefined;
  /** Monotonic counter for search-index rebuilds (stale-build guard). */
  private indexBuildGen = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    readonly globalState?: vscode.Memento,
  ) {}

  // ── Context accessors (HostContext / WatcherContext / ProviderActionsContext) ──

  getWebview(): vscode.Webview | undefined {
    return this.view?.webview;
  }
  isDisposed(): boolean {
    return this.view === undefined;
  }
  /**
   * Regenerate the webview document so the Preact app re-mounts from
   * scratch. Reuses the shared html builder, so the CSP + a fresh nonce
   * are reapplied on every reset. Called by the global reloadAll.
   */
  resetWebviewHtml(): void {
    const view = this.view;
    if (!view) return;
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
  }
  getSessions(): Session[] {
    return this.sessions;
  }
  setSessions(sessions: Session[]): void {
    this.sessions = sessions;
  }
  getSkills(): Skill[] {
    return this.skills;
  }
  setSkills(skills: Skill[]): void {
    this.skills = skills;
  }
  setCommands(commands: Command[]): void {
    this.commands = commands;
  }
  setHooks(hooks: Hook[]): void {
    this.hooks = hooks;
  }
  getMcpServers(): McpServer[] {
    return this.mcpServers;
  }
  setMcpServers(servers: McpServer[]): void {
    this.mcpServers = servers;
  }
  setAgents(agents: Agent[]): void {
    this.agents = agents;
  }
  getLastPostedWorkspace(): string | undefined {
    return this.lastPostedWorkspace;
  }
  setLastPostedWorkspace(ws: string | undefined): void {
    this.lastPostedWorkspace = ws;
  }
  getLiveStateRefreshTimer(): NodeJS.Timeout | undefined {
    return this.liveStateRefreshTimer;
  }
  setLiveStateRefreshTimer(t: NodeJS.Timeout | undefined): void {
    this.liveStateRefreshTimer = t;
  }
  nextIndexBuildGen(): number {
    return ++this.indexBuildGen;
  }
  getIndexBuildGen(): number {
    return this.indexBuildGen;
  }
  getLastSeenIdentity(): string | null {
    return this.lastSeenIdentity;
  }
  setLastSeenIdentity(id: string | null): void {
    this.lastSeenIdentity = id;
  }
  getIdentityToastPending(): boolean {
    return this.identityToastPending;
  }
  setIdentityToastPending(pending: boolean): void {
    this.identityToastPending = pending;
  }

  // ── Delegating wrappers (kept on the instance so command-palette entries
  //    and the extracted modules can call them through the context) ──

  dispatch(msg: WebviewMessage): Promise<void> {
    return dispatch(msg, this);
  }
  postWorkspacePath(): void {
    postWorkspacePath(this);
  }
  refreshSettings(): void {
    refreshSettings(this);
  }
  refreshLiveState(): void {
    refreshLiveState(this);
  }
  buildSearchIndex(): void {
    buildSearchIndex(this);
  }
  reloadAll(): Promise<void> {
    return reloadAll(this);
  }
  checkForIdentityChange(data: AccountData): void {
    checkForIdentityChange(this, data);
  }
  /**
   * Native QuickPick account switcher. Public so the command palette entry
   * (`claudeManager.switchAccount`) can invoke it directly — not only via
   * postMessage from the webview.
   */
  openAccountSwitcher(): Promise<void> {
    return openAccountSwitcher(this);
  }

  /** Called by VS Code when the webview view becomes visible. */
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => this.dispatch(msg));

    // Sweep leftover .bak files from an interrupted profile swap.
    void sweepSwitchBackups();

    // Set up file watchers once per webview lifecycle.
    this.watcherHandle = createWatchers(this);

    // Re-sync workspace path whenever folders change. Without this, switching
    // workspaces or having the workspace resolve after the initial "ready"
    // handshake leaves the webview stuck on a stale (or empty) project name.
    this.viewSubscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.postWorkspacePath();
      }),
    );

    // Re-post the branch when the user checks out a different ref. We only
    // push the branch (not the full workspace path) so checkouts don't
    // churn the project-name UI.
    this.viewSubscriptions.push(
      onBranchChange(() => {
        const wv = this.view?.webview;
        if (!wv) return;
        wv.postMessage({ type: "workspaceBranch", data: getCurrentBranch() });
      }),
    );

    // Re-push settings when the Claude Code extension gets installed or
    // uninstalled mid-session so the New Chat / Launch-in-Chat affordances
    // appear or disappear without a panel reload.
    this.viewSubscriptions.push(
      vscode.extensions.onDidChange(() => {
        this.refreshSettings();
      }),
    );

    // Drive the process-death poller off webview visibility. When the
    // panel is hidden we have no UI to update, so the poll is pure CPU
    // waste — pause it.
    this.livePoll.start();
    this.viewSubscriptions.push(
      view.onDidChangeVisibility(() => {
        if (this.view?.visible) {
          this.livePoll.start();
          // Re-sync on re-show: while hidden, sessions may have died
          // without the poller catching it. One immediate refresh closes
          // the gap before the slow tick kicks back in.
          this.refreshLiveState();
        } else {
          this.livePoll.stop();
        }
      }),
    );

    view.onDidDispose(() => {
      // Clear `view` so any pending debounce timers find a null webview and
      // bail instead of posting to a disposed surface.
      this.view = undefined;
      this.disposeLifecycle();
    });
  }

  private disposeLifecycle(): void {
    if (this.liveStateRefreshTimer) clearTimeout(this.liveStateRefreshTimer);
    this.liveStateRefreshTimer = undefined;
    this.livePoll.stop();
    this.watcherHandle?.dispose();
    this.watcherHandle = undefined;
    for (const sub of this.viewSubscriptions) sub.dispose();
    this.viewSubscriptions = [];
  }
}
