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
import { broadcastSink, type PanelSink } from "../../extension/panelSink";
import { getCurrentBranch, onBranchChange } from "../../extension/git";
import { setTerminalRegistry } from "../../extension/terminal";
import type { AccountData } from "../account/types";
import { dispatch } from "./messageHandlers";
import { type HostContext } from "./hostContext";
import { createTerminalRegistry, type TerminalRegistry } from "./terminalRegistry";
import { createTerminalLinker } from "./terminalLinker";
import { createWatchers, type WatcherContext } from "./watchers";
import { createLivePoll, type LivePoll } from "./liveState";
import { openAccountSwitcher } from "./accountSwitcher";
import {
  reloadAll,
  reloadFeature,
  refreshSettings,
  postWorkspacePath,
  refreshLiveState,
  refreshAccountData,
  buildSearchIndex,
  checkForIdentityChange,
  sweepSwitchBackups,
  type ConfigFeature,
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
  /**
   * Every live panel. The container is contributed to both the activity
   * bar and the secondary sidebar, so the user can open it on either
   * side — or both at once. The host state below is shared across them;
   * only the webviews are per-panel.
   */
  private views = new Set<vscode.WebviewView>();
  /** Stable broadcast handle over {@link views}; see {@link getWebview}. */
  private sink?: PanelSink;
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
  readonly terminals: TerminalRegistry = createTerminalRegistry();
  /**
   * Passive watcher for `claude --resume <uuid>` commands typed into ANY
   * terminal (not just the ones we launched). Lives for the provider's
   * lifetime so external launches register even before the panel opens.
   */
  private readonly terminalLinker: vscode.Disposable = createTerminalLinker(this.terminals);
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
  ) {
    setTerminalRegistry(this.terminals);
  }

  // ── Context accessors (HostContext / WatcherContext / ProviderActionsContext) ──

  getWebview(): PanelSink | undefined {
    if (this.views.size === 0) return undefined;
    // Memoised, and NOT merely for allocation: accountPush dedupes its
    // payload in a WeakMap keyed on this object. A fresh sink per call
    // would never hit that cache, silently turning every push into a
    // redundant one. The handle is invalidated whenever the panel set
    // changes, which is exactly when a re-push IS wanted.
    this.sink ??= broadcastSink([...this.views].map((v) => v.webview));
    return this.sink;
  }
  isDisposed(): boolean {
    return this.views.size === 0;
  }
  /**
   * The view id a "show the panel" command should focus.
   *
   * Prefers a panel already on screen, then any resolved one, and only
   * then the activity bar. Focusing a view the user never opened would
   * pop open a sidebar they had closed; focusing one that has not
   * resolved on this host is a silent no-op, which is the failure this
   * avoids.
   */
  preferredFocusViewId(fallback: string): string {
    for (const view of this.views) {
      if (view.visible) return view.viewType;
    }
    for (const view of this.views) return view.viewType;
    return fallback;
  }
  /** True while any panel is on screen — drives the visibility-gated poller. */
  private anyVisible(): boolean {
    for (const view of this.views) {
      if (view.visible) return true;
    }
    return false;
  }
  /**
   * Regenerate the webview document so the Preact app re-mounts from
   * scratch. Reuses the shared html builder, so the CSP + a fresh nonce
   * are reapplied on every reset. Called by the global reloadAll.
   */
  resetWebviewHtml(): void {
    for (const view of this.views) {
      view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    }
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
  refreshAccountData(): void {
    refreshAccountData(this);
  }
  buildSearchIndex(): void {
    buildSearchIndex(this);
  }
  reloadAll(): Promise<void> {
    return reloadAll(this);
  }
  reloadConfigFeature(feature: ConfigFeature): void {
    reloadFeature(this, feature);
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
    const isFirstPanel = this.views.size === 0;
    this.views.add(view);
    this.sink = undefined;
    // A re-resolved view (window reload, panel move, context eviction) is a
    // brand-new webview whose in-memory state — including its derived
    // currentProject — has reset to empty. The workspace-path dedupe cache
    // lives on the provider and survives that recreation, so without this
    // reset the upcoming `ready` post would be skipped as a no-op and the new
    // webview would never learn its project. That leaves the "This Project"
    // filter unscoped (shows every project, and buries new sessions past the
    // recent-window cap). Invalidate the cache so `ready` always re-posts.
    this.lastPostedWorkspace = undefined;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => this.dispatch(msg));

    // Drive the process-death poller off panel visibility. With the panel
    // hidden there is no UI to update, so the poll is pure CPU waste —
    // and with two panels it is "any of them visible", or opening the
    // second would be undone by the first reporting itself hidden.
    this.viewSubscriptions.push(
      view.onDidChangeVisibility(() => {
        if (this.anyVisible()) {
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
      this.views.delete(view);
      this.sink = undefined;
      // Shared state outlives one panel: tear it down only when the last
      // one closes, or closing the left panel would silently stop the
      // right one from ever updating again.
      if (this.views.size === 0) {
        this.disposeLifecycle();
      } else if (!this.anyVisible()) {
        this.livePoll.stop();
      }
    });

    // Everything below is shared across panels — one watcher fleet, one
    // poller, one set of listeners. A second panel reuses them.
    if (!isFirstPanel) return;

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
        this.getWebview()?.postMessage({
          type: "workspaceBranch",
          data: getCurrentBranch(),
        });
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

    this.viewSubscriptions.push(
      this.terminals.onChange((ids) => {
        this.getWebview()?.postMessage({ type: "terminalSessions", ids });
      }),
    );

    this.livePoll.start();
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
