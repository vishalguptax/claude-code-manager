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
  resolveClaudeTarget,
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
import type { AccountData } from "../account/types";
import { fetchQuota } from "../account/quota";
import {
  saveProfile as saveProfileSnapshot,
  switchProfile as switchProfileSnapshot,
  updateProfile as updateProfileSnapshot,
  removeProfile as removeProfileSnapshot,
  listProfiles as listProfilesSnapshot,
} from "../account/profiles";
import type { SavedProfile } from "../account/profiles";
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
 * Build the modal body shown before a profile switch. The base
 * message always warns about running Claude terminals; when the
 * snapshot's access token is already past its `expiresAt`, we prepend
 * a stale-token notice so the user knows a `/login` may be required
 * after the swap (refresh tokens rotate on use, so a long-stale
 * snapshot may have no valid refresh path left).
 */
function buildSwitchConfirmDetail(profile: SavedProfile | undefined): string {
  const base =
    "Your home-dir credentials will be overwritten with this saved profile. Close any running Claude terminals first — in-flight sessions may fail mid-task.";
  if (!profile || !profile.tokenExpiresAt) return base;
  const ageMs = Date.now() - profile.tokenExpiresAt;
  if (ageMs <= 0) return base;
  const days = Math.floor(ageMs / 86_400_000);
  const when =
    days >= 2 ? `${days} days ago` : days === 1 ? "yesterday" : "recently";
  return `⚠ The saved access token expired ${when}. Claude CLI will try to refresh in the background; if the refresh token has also rotated since you saved this profile, you'll need to /login after switching.\n\n${base}`;
}

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
  /**
   * Last observed live `userID`. Used by the file watcher to spot
   * identity changes (manual CLI `/login` / `/logout` cycles) so we
   * can nudge the user to save the new account as a profile when no
   * matching saved slot exists. Seeded on the first account parse so
   * the initial load doesn't trigger a false-positive toast.
   *
   *   null    — never parsed yet (no comparison possible)
   *   ""      — parsed, live is signed out
   *   "abc…"  — parsed, signed in as user abc…
   */
  private lastSeenUserID: string | null = null;
  /**
   * Single in-flight identity-change toast. Guards against stacked
   * notifications when the user rapid-fires `/logout` + `/login`
   * cycles — only one prompt shows at a time; subsequent identity
   * changes that land while the toast is up skip posting another.
   * Cleared when the current toast resolves (button click or dismiss).
   */
  private identityToastPending = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState?: vscode.Memento,
  ) {}

  /** Called by VS Code when the webview view becomes visible. */
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    view.webview.html = getWebviewHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: WebviewMessage) => this.onMessage(msg));

    // Sweep leftover .bak files from an interrupted profile swap.
    // switchProfile backs live files up before rename + removes the
    // backups on success; if the process died mid-swap (power loss,
    // VS Code force-quit), the backups linger. Detect + surface a
    // one-time recovery prompt so users with half-switched state can
    // restore cleanly.
    void this.sweepSwitchBackups();

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
  /**
   * Re-parse every feature's data and push a fresh snapshot to the
   * webview without recreating it. Cancels any pending file-watcher
   * debounces so callers see only the post-reload state. Idempotent —
   * safe to fire from the toolbar button, the command palette, and
   * back-to-back invocations.
   *
   * Tab state and scroll position are preserved because the webview
   * instance is unchanged: only the data messages are republished.
   */
  reloadAll(): void {
    const wv = this.view?.webview;
    if (!wv) return;
    if (this.accountReparseTimer) clearTimeout(this.accountReparseTimer);
    this.accountReparseTimer = undefined;
    if (this.sessionsReparseTimer) clearTimeout(this.sessionsReparseTimer);
    this.sessionsReparseTimer = undefined;

    const workspace = getWorkspace();
    const ws = workspace || undefined;

    try {
      this.sessions = parseSessions(loadState().renames);
      wv.postMessage({
        type: "sessions",
        data: groupSessions(this.sessions),
        stats: getStats(this.sessions),
      });
      wv.postMessage({ type: "projects", data: getUniqueProjects(this.sessions) });
      wv.postMessage({ type: "userState", ...loadState() });
      const warning = getLastParseWarning();
      if (warning) wv.postMessage({ type: "error", message: warning });
      this.buildSearchIndex();
    } catch (err) {
      console.warn("[claude-manager] reload sessions failed:", err);
    }

    try {
      wv.postMessage({ type: "accountData", data: parseAccountData(ws) });
    } catch (err) {
      console.warn("[claude-manager] reload account failed:", err);
    }

    try {
      this.skills = parseSkills(ws);
      wv.postMessage({ type: "skills", data: this.skills });
    } catch (err) {
      console.warn("[claude-manager] reload skills failed:", err);
    }

    try {
      this.commands = parseCommands(ws);
      wv.postMessage({ type: "commands", data: this.commands });
    } catch (err) {
      console.warn("[claude-manager] reload commands failed:", err);
    }

    try {
      this.hooks = parseHooks(ws);
      wv.postMessage({ type: "hooks", data: this.hooks });
    } catch (err) {
      console.warn("[claude-manager] reload hooks failed:", err);
    }

    try {
      this.mcpServers = parseMcpServers(ws);
      wv.postMessage({ type: "mcpServers", data: this.mcpServers });
    } catch (err) {
      console.warn("[claude-manager] reload mcp failed:", err);
    }

    try {
      this.agents = parseAgents(ws);
      wv.postMessage({ type: "agents", data: this.agents });
    } catch (err) {
      console.warn("[claude-manager] reload agents failed:", err);
    }

    this.refreshSettings();
    this.postWorkspacePath();
    wv.postMessage({ type: "reloadComplete" });
  }

  refreshSettings(): void {
    const wv = this.view?.webview;
    if (!wv) return;
    const sessConfig = vscode.workspace.getConfiguration("claudeManager.sessions");
    const rootConfig = vscode.workspace.getConfiguration("claudeManager");
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
      marketplaceSkillsUrl: rootConfig.get<string>(
        "marketplaceSkillsUrl",
        "https://github.com/anthropics/claude-code/wiki/Skills",
      ),
      marketplaceMcpUrl: rootConfig.get<string>("marketplaceMcpUrl", "https://mcp.so"),
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
        try {
          const ws = getWorkspace();
          const data = parseAccountData(ws || undefined);
          // Identity-change detection: when the live userID shifts
          // (manual CLI /login replaced the account behind our back),
          // nudge the user to save the new account as a profile so
          // the next login doesn't wipe it too. Silent when the new
          // account already has a saved slot — that's a known
          // identity and no prompt is useful.
          this.checkForIdentityChange(data);
          if (wv) {
            wv.postMessage({ type: "accountData", data });
          }
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

  /**
   * Passive post-swap observer. Compares `data.profile.userID` against
   * the previous seen value and surfaces a non-blocking nudge when:
   *   - the user logged into a brand-new account (no saved slot for
   *     the new userID) — toast offers a "Save as profile" shortcut
   *
   * Seeds `lastSeenUserID` silently on the first parse so extension
   * activation never fires a false-positive toast. Re-entries for the
   * same userID (token rotations) skip the check entirely.
   *
   * This is the closest we can get to "prevent CLI /login from silently
   * replacing an account": CLI owns its terminal, so we can't block the
   * write — but we can see the result, compare identities, and point
   * the user at the switcher before they lose more state.
   */
  private checkForIdentityChange(data: AccountData): void {
    const liveUserID = data.profile.userID ?? "";
    if (this.lastSeenUserID === null) {
      // First observation — seed and return silently.
      this.lastSeenUserID = liveUserID;
      return;
    }
    if (liveUserID === this.lastSeenUserID) return;

    const prevUserID = this.lastSeenUserID;
    this.lastSeenUserID = liveUserID;

    // Logged out — identity went from something to nothing. The
    // signed-out UI already shows the switcher prominently, so no
    // extra toast needed here.
    if (!liveUserID) return;

    // New identity is already backed by a saved slot — this is an
    // expected switch (via our switcher or a re-login to a known
    // account). Nothing to nudge about.
    const hasSlotForNew = data.savedProfiles.some(
      (p) => p.userID && p.userID === liveUserID,
    );
    if (hasSlotForNew) return;

    // Old identity wasn't saved either → surface the loss so the user
    // knows the previous account can't be recovered from our side.
    // Still end the toast on the actionable "Save" button so the NEW
    // identity doesn't suffer the same fate next login.
    const hadSlotForPrev =
      !!prevUserID &&
      data.savedProfiles.some((p) => p.userID && p.userID === prevUserID);

    const email = data.profile.email || data.profile.displayName || "this account";
    const prelude = hadSlotForPrev
      ? `Switched to ${email}.`
      : `Switched to ${email}. The previous account wasn't saved — to restore it you'll need to re-login.`;

    // Single-toast gate: if a prior notification is still on screen,
    // skip this one. Rapid logout/login cycles would otherwise stack
    // multiple info messages in VS Code's notification queue.
    if (this.identityToastPending) return;
    this.identityToastPending = true;

    void vscode.window
      .showInformationMessage(
        `${prelude} Save this account as a profile so you can switch back without re-logging-in.`,
        "Save as profile",
        "Dismiss",
      )
      .then((choice) => {
        this.identityToastPending = false;
        if (choice === "Save as profile") {
          void this.onMessage({ type: "promptSaveProfile" } as WebviewMessage);
        }
      });
  }

  /**
   * Detect + recover from a profile switch that crashed between the
   * two file renames. switchProfile copies live files to
   * `~/.claude.json.bak` + `~/.claude/.credentials.json.bak` before
   * renaming, then deletes those backups on success — so their
   * presence on startup implies an interrupted swap.
   *
   * Rather than silently rolling back or silently discarding, we
   * prompt the user with three explicit choices:
   *   - Restore previous identity (copy .bak → live; they picked the
   *     wrong profile or the switch failed and they want their old
   *     account back)
   *   - Discard backup (the live files are what they want; backups
   *     are stale)
   *   - Later (leave .bak in place; prompt again next session)
   */
  private async sweepSwitchBackups(): Promise<void> {
    const home = os.homedir();
    const claudeDir = path.join(home, ".claude");
    const claudeJsonBak = path.join(home, ".claude.json.bak");
    const credsBak = path.join(claudeDir, ".credentials.json.bak");
    const hasClaudeJsonBak = fs.existsSync(claudeJsonBak);
    const hasCredsBak = fs.existsSync(credsBak);
    if (!hasClaudeJsonBak && !hasCredsBak) return;

    const choice = await vscode.window.showWarningMessage(
      "Found leftover backup from an interrupted profile switch.",
      {
        modal: true,
        detail:
          "Claude Manager was interrupted while swapping accounts. The previous account's credentials are still on disk as .bak files. Restore them, discard them, or decide later.",
      },
      "Restore previous",
      "Discard backup",
      "Later",
    );

    const claudeJson = path.join(home, ".claude.json");
    const credsFile = path.join(claudeDir, ".credentials.json");

    if (choice === "Restore previous") {
      try {
        if (hasClaudeJsonBak) fs.copyFileSync(claudeJsonBak, claudeJson);
        if (hasCredsBak) fs.copyFileSync(credsBak, credsFile);
        if (hasClaudeJsonBak) fs.rmSync(claudeJsonBak, { force: true });
        if (hasCredsBak) fs.rmSync(credsBak, { force: true });
        vscode.window.showInformationMessage(
          "Previous Claude account restored. Reload the Claude Manager panel to refresh.",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Restore failed: ${msg}.`);
      }
      return;
    }
    if (choice === "Discard backup") {
      try {
        if (hasClaudeJsonBak) fs.rmSync(claudeJsonBak, { force: true });
        if (hasCredsBak) fs.rmSync(credsBak, { force: true });
      } catch {
        // Best-effort cleanup; a persistent failure isn't worth
        // surfacing as an error toast.
      }
      return;
    }
    // choice === "Later" or modal dismissed — leave .bak files alone.
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
        const query = (msg as { query?: string }).query ?? "";
        const detail = parseSessionDetail(
          msg.sessionId,
          this.sessions.find((s) => s.id === msg.sessionId),
          mode,
          query,
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

      case "reloadAll":
        this.reloadAll();
        break;

      case "searchFullText": {
        // Transcript content search runs synchronously on the pre-built
        // lowercased index. The reply carries the echo-query so the webview
        // can drop stale results if the user has since typed more.
        const ids = searchContent(msg.query);
        wv.postMessage({ type: "fullTextResults", query: msg.query, ids });
        break;
      }

      case "launchChatWithPrompt": {
        // Route via the shared resumeIn setting so Ask Again / Launch
        // in Chat respect the user's chosen surface. Extension → URI
        // handler. Terminal → spawn `claude` and inject prompt after
        // activation (~1800 ms — same timing launchSlash uses).
        // Cap prompt length once up-front regardless of target: URIs
        // cap at ~2 MB in Chromium but shells (cmd/PowerShell) reject
        // far smaller; terminal sendText fine with 4 KB.
        const PROMPT_MAX = 4000;
        const prompt =
          msg.prompt.length > PROMPT_MAX
            ? msg.prompt.slice(0, PROMPT_MAX) + "\n\n…(truncated)"
            : msg.prompt;
        if (msg.prompt.length > PROMPT_MAX) {
          vscode.window.showInformationMessage(
            `Prompt was truncated to ${PROMPT_MAX} characters before launching Claude.`,
          );
        }
        const target = await resolveClaudeTarget(undefined);
        if (target === "cancel") break;
        if (target === "extension") {
          await openPromptInExtension(prompt);
        } else {
          // Terminal path: launch claude, then send the prompt after a
          // short delay so Claude has switched to raw-input mode. Same
          // pattern launchSlash uses for /login + /config.
          const term = createTerminal("Claude: ask");
          term.show();
          term.sendText("claude");
          setTimeout(() => term.sendText(prompt), 1800);
        }
        break;
      }

      case "openProjectAndChat": {
        // The URI handler is workspace-scoped, so we have to open the
        // target project first and then fire the URI. VS Code opens
        // the new window asynchronously — the delay lets the Claude
        // Code extension finish activating in the new window before
        // the URI is dispatched. 3000ms is empirical: short enough to
        // not feel laggy, long enough for cold-start activation on
        // slower machines. Without it the URI races activation and
        // the chat tab opens without the prompt attaching.
        openProject(msg.projectPath);
        if (isClaudeCodeExtensionInstalled()) {
          setTimeout(() => openPromptInExtension(""), 3000);
        }
        break;
      }

      case "openProject":
        openProject(msg.projectPath);
        break;

      case "newSession":
        await newSession();
        break;

      case "continueLastSession":
        await continueLastSession(this.sessions);
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

      case "fetchQuota": {
        // The only network call in Claude Manager — opt-in, triggered
        // only by the user clicking Refresh on the Quota card. The
        // result carries either `data` or an `error` shape so the
        // webview can render a precise UI state instead of a generic
        // "something went wrong" message.
        const result = await fetchQuota();
        wv.postMessage({ type: "quotaData", result });
        break;
      }

      case "saveProfile": {
        // Snapshot current creds into a new slot. Label already
        // validated by the caller (host's promptSaveProfile path or a
        // future programmatic caller).
        const result = saveProfileSnapshot(msg.label);
        if (!result.ok) {
          if (result.error === "already-saved" && result.detail) {
            // A slot already exists for this identity — happens when
            // Claude CLI's token rotation desynced the active-profile
            // hash match and the UI re-surfaced "Save profile". Offer
            // to Update the existing slot so tokens get re-captured,
            // which is almost always the user's actual intent.
            const existingSlug = result.detail;
            const existing = listProfilesSnapshot().find((p) => p.slug === existingSlug);
            const label = existing?.label ?? existingSlug;
            const choice = await vscode.window.showInformationMessage(
              `A profile already exists for this account (${label}).`,
              {
                modal: true,
                detail:
                  "Refresh its saved tokens with the current login so it picks up Claude CLI's latest rotated token.",
              },
              "Update existing",
            );
            if (choice === "Update existing") {
              const upd = updateProfileSnapshot(existingSlug);
              if (!upd.ok) {
                vscode.window.showErrorMessage(
                  `Couldn't update profile: ${upd.detail ?? upd.error}.`,
                );
              } else {
                vscode.window.showInformationMessage(
                  `Profile "${upd.data.label}" refreshed.`,
                );
              }
            }
          } else {
            vscode.window.showErrorMessage(
              `Couldn't save profile: ${result.detail ?? result.error}.`,
            );
          }
        }
        const workspace = getWorkspace();
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
        break;
      }

      case "promptSaveProfile": {
        // Native VS Code input box replaces the old inline save form.
        // Default label sourced from the live account so most users
        // can just press Enter. We pre-parse account data once to seed
        // the default; re-parse after save so the reply reflects the
        // new profile list.
        const workspace = getWorkspace();
        const current = parseAccountData(workspace || undefined);
        const p = current.profile;

        // One-time security disclaimer: saving copies the OAuth
        // token into ~/.claude/manager-accounts/. We surface that
        // exactly once via globalState so users give informed
        // consent on first save, then never see it again. Refusing
        // the prompt aborts the save entirely.
        const DISCLAIMER_KEY = "claudeManager.accounts.disclaimerAck";
        const seen = this.globalState?.get<boolean>(DISCLAIMER_KEY) ?? false;
        if (!seen) {
          const choice = await vscode.window.showWarningMessage(
            "Save Claude account as a profile?",
            {
              modal: true,
              detail:
                "Claude Manager will copy your OAuth tokens from ~/.claude.json and ~/.claude/.credentials.json into ~/.claude/manager-accounts/ so you can switch back to this account later. Tokens are stored in plain text — same format Claude CLI uses. Treat that folder as sensitive. This notice is shown once.",
            },
            "Understood, save",
          );
          if (choice !== "Understood, save") break;
          await this.globalState?.update(DISCLAIMER_KEY, true);
        }

        const defaultLabel =
          p.organizationName ||
          p.displayName ||
          (p.email ? p.email.split("@")[0] : "Profile");
        const label = await vscode.window.showInputBox({
          title: "Save account as profile",
          prompt: "Label for this Claude account snapshot",
          value: defaultLabel,
          validateInput: (v: string) =>
            v.trim().length > 0 ? null : "Label cannot be empty",
        });
        if (label === undefined) break;
        const result = saveProfileSnapshot(label);
        if (!result.ok) {
          if (result.error === "already-saved" && result.detail) {
            // Same dedupe path as the `saveProfile` case — see there.
            const existingSlug = result.detail;
            const existing = listProfilesSnapshot().find((pp) => pp.slug === existingSlug);
            const existingLabel = existing?.label ?? existingSlug;
            const choice = await vscode.window.showInformationMessage(
              `A profile already exists for this account (${existingLabel}).`,
              {
                modal: true,
                detail:
                  "Refresh its saved tokens with the current login so it picks up Claude CLI's latest rotated token.",
              },
              "Update existing",
            );
            if (choice === "Update existing") {
              const upd = updateProfileSnapshot(existingSlug);
              if (!upd.ok) {
                vscode.window.showErrorMessage(
                  `Couldn't update profile: ${upd.detail ?? upd.error}.`,
                );
              } else {
                vscode.window.showInformationMessage(
                  `Profile "${upd.data.label}" refreshed.`,
                );
              }
            }
          } else {
            vscode.window.showErrorMessage(
              `Couldn't save profile: ${result.detail ?? result.error}.`,
            );
          }
        }
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
        break;
      }

      case "openAccountSwitcher":
        await this.openAccountSwitcher();
        break;

      case "switchProfile": {
        // Destructive-ish: overwrites ~/.claude.json + credentials.
        // Require modal confirmation so a mis-click doesn't yank the
        // user's login out from under a running Claude session.
        const targetProfile = listProfilesSnapshot().find((p) => p.slug === msg.slug);
        const confirm = await vscode.window.showWarningMessage(
          "Switch Claude account?",
          {
            modal: true,
            detail: buildSwitchConfirmDetail(targetProfile),
          },
          "Switch",
        );
        if (confirm !== "Switch") break;
        const result = switchProfileSnapshot(msg.slug);
        if (!result.ok) {
          vscode.window.showErrorMessage(
            `Switch failed: ${result.detail ?? result.error}.`,
          );
        } else {
          vscode.window.showInformationMessage(
            `Switched to ${result.data.email || result.data.label}.`,
          );
        }
        const workspace = getWorkspace();
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
        break;
      }

      case "updateProfile": {
        // Re-snapshot live creds into an existing slot — used after
        // Claude CLI rotates the access token so the saved profile
        // stays current. No confirmation; it's strictly additive.
        const result = updateProfileSnapshot(msg.slug);
        if (!result.ok) {
          vscode.window.showErrorMessage(
            `Couldn't update profile: ${result.detail ?? result.error}.`,
          );
        }
        const workspace = getWorkspace();
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
        break;
      }

      case "removeProfile": {
        const confirm = await vscode.window.showWarningMessage(
          "Delete saved profile?",
          {
            modal: true,
            detail:
              "The snapshot (including its OAuth token copy) will be permanently removed from ~/.claude/manager-accounts. The live Claude account isn't affected.",
          },
          "Delete",
        );
        if (confirm !== "Delete") break;
        const result = removeProfileSnapshot(msg.slug);
        if (!result.ok) {
          vscode.window.showErrorMessage(
            `Couldn't delete profile: ${result.detail ?? result.error}.`,
          );
        }
        const workspace = getWorkspace();
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
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
        // Write both keys so both schemas agree — legacy CLI versions
        // read `voiceEnabled`, current CLI reads `voice.enabled`. Without
        // touching both, the toggle could appear to flip back on next
        // open when the CLI overwrites one key and we only wrote the
        // other.
        writeSettingsValue("voiceEnabled", msg.value);
        writeSettingsValue("voice.enabled", msg.value);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "setSetting": {
        // Generic writer — key is dotted path, value is any JSON-safe
        // scalar or array. Empty string / null / undefined removes the
        // key (writeSettingsValue handles that case).
        writeSettingsValue(msg.key, msg.value, msg.scope ?? "global", getWorkspace() || undefined);
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
        break;
      }

      case "runCommand": {
        // Whitelist guard: webview must not be able to fire arbitrary
        // VS Code commands. Only Claude-Manager-owned commands pass.
        const allowed = new Set([
          "claudeManager.exportBrain",
          "claudeManager.importBrain",
          "claudeManager.switchAccount",
          "claudeManager.open",
        ]);
        if (allowed.has(msg.command)) {
          await vscode.commands.executeCommand(msg.command);
        }
        break;
      }

      case "promptRemovePermission": {
        // Confirm-before-delete to prevent mis-click data loss on
        // the inline remove buttons inside the Permissions list.
        const { scope: permScope, tool, list: permList } = msg;
        const confirm = await vscode.window.showWarningMessage(
          `Remove ${permList === "allow" ? "allowed" : "denied"} tool?`,
          {
            modal: true,
            detail: `\"${tool}\" will be removed from the ${permScope} scope. You can re-add it via "Add tool" or by editing the settings file directly.`,
          },
          "Remove",
        );
        if (confirm !== "Remove") break;
        removePermissionEntry(permScope, tool, permList, getWorkspace() || undefined);
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(getWorkspace() || undefined),
        });
        break;
      }

      case "resetSettings": {
        const scope = msg.scope;
        const confirm = await vscode.window.showWarningMessage(
          `Reset ${scope} settings.json?`,
          {
            modal: true,
            detail:
              "The current settings file will be renamed to `settings.json.bak-<timestamp>` and a fresh file will be created on Claude's next launch. All your custom model, voice, attribution, hooks, permissions, and tool allow/deny rules in this scope will stop taking effect until you restore the .bak. Reversible.",
          },
          "Reset",
        );
        if (confirm !== "Reset") break;
        const workspace = getWorkspace();
        const filePath = resolveSettingsPath(scope, workspace || undefined);
        if (!filePath) {
          vscode.window.showErrorMessage(`Can't resolve settings path for ${scope} scope.`);
          break;
        }
        try {
          if (fs.existsSync(filePath)) {
            const bak = `${filePath}.bak-${Date.now()}`;
            fs.renameSync(filePath, bak);
            vscode.window.showInformationMessage(
              `Settings reset. Backup at ${path.basename(bak)}.`,
            );
          } else {
            vscode.window.showInformationMessage(
              `${scope} settings file was already empty.`,
            );
          }
          wv.postMessage({
            type: "accountData",
            data: parseAccountData(workspace || undefined),
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Reset failed: ${errMsg}.`);
        }
        break;
      }

      case "promptAddDirectory": {
        const workspace = getWorkspace();
        const current = parseAccountData(workspace || undefined);
        const existing = current.settings.additionalDirectories;
        // Native folder picker beats a raw text input — users don't
        // have to type or copy an absolute path, and the dialog's
        // validation is OS-idiomatic (no missing-path guessing).
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: "Add directory",
          title: "Pick a directory Claude is allowed to read",
        });
        if (!picked || picked.length === 0) break;
        const dir = picked[0].fsPath;
        if (existing.includes(dir)) {
          vscode.window.showInformationMessage(`\"${dir}\" is already in the list.`);
          break;
        }
        const next = [...existing, dir];
        writeSettingsValue(
          "permissions.additionalDirectories",
          next,
          "global",
          workspace || undefined,
        );
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
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

  /**
   * Native QuickPick-based account switcher. Extracted as a public
   * method so the command palette entry (`claudeManager.switchAccount`)
   * can invoke it directly — not only via postMessage from the
   * webview.
   */
  async openAccountSwitcher(): Promise<void> {
    const wv = this.view?.webview;
    const workspace = getWorkspace();
    const current = parseAccountData(workspace || undefined);
    // Overlay the active profile's displayed email with the live
    // profile email when it diverges — users who changed their email
    // on claude.ai after saving would otherwise see the snapshot's
    // stale value in the switcher. The overlay only affects display;
    // the stored snapshot stays untouched so Update Profile can
    // re-capture when the user wants.
    const savedProfiles = current.savedProfiles.map((p) => {
      if (
        p.slug === current.activeProfileSlug &&
        current.profile.email &&
        current.profile.email !== p.email
      ) {
        return { ...p, email: current.profile.email };
      }
      return p;
    });
    const activeSlug = current.activeProfileSlug;

    const UPDATE_BUTTON: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("sync"),
      tooltip: "Update snapshot with current credentials",
    };
    const REMOVE_BUTTON: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("trash"),
      tooltip: "Delete saved profile",
    };

    type Item = vscode.QuickPickItem & {
      action: "switch" | "save" | "login";
      slug?: string;
    };

    // Active profile first — users see "where am I" without scanning.
    const sortedProfiles = [...savedProfiles].sort((a, b) => {
      if (a.slug === activeSlug) return -1;
      if (b.slug === activeSlug) return 1;
      return 0;
    });

    // ThemeIcon via iconPath aligns consistently across every row
    // regardless of label length — cleaner than `$(…)` prefixes.
    const CHECK_ICON = new vscode.ThemeIcon("check");
    const ACCOUNT_ICON = new vscode.ThemeIcon("account");
    const SAVE_ICON = new vscode.ThemeIcon("save");
    const LOGIN_ICON = new vscode.ThemeIcon("log-in");

    // Pre-scan: identify duplicate profiles so we can mark any row
    // that isn't the freshest saved slot for its identity. Users
    // accumulated duplicates under the old hash-only active detection;
    // the dedupe fix prevents NEW ones but legacy duplicates persist.
    //
    // Grouping key is userID + email tuple — userID alone is unsafe
    // because pre-fix saves could capture a stale userID from
    // `.claude.json` mid-write, producing two genuinely distinct
    // accounts that happen to share a (wrong) userID. Requiring both
    // fields to match catches real duplicates without false-flagging
    // unrelated accounts that share corrupted metadata.
    const identityGroups = new Map<string, SavedProfile[]>();
    for (const p of savedProfiles) {
      if (!p.userID || !p.email) continue;
      const key = `${p.userID}|${p.email.toLowerCase()}`;
      const bucket = identityGroups.get(key) ?? [];
      bucket.push(p);
      identityGroups.set(key, bucket);
    }
    const duplicateSlugs = new Set<string>();
    for (const group of identityGroups.values()) {
      if (group.length <= 1) continue;
      const ranked = [...group].sort((a, b) => {
        const at = Date.parse(a.savedAt || "") || 0;
        const bt = Date.parse(b.savedAt || "") || 0;
        return bt - at;
      });
      for (let i = 1; i < ranked.length; i++) duplicateSlugs.add(ranked[i].slug);
    }

    const items: Item[] = [];
    for (const p of sortedProfiles) {
      const isActive = p.slug === activeSlug;
      const isDuplicate = duplicateSlugs.has(p.slug);
      const metaParts: string[] = [];
      if (p.email) metaParts.push(p.email);
      if (p.subscriptionType) metaParts.push(p.subscriptionType);
      if (p.organizationName) metaParts.push(p.organizationName);
      if (isDuplicate) metaParts.push("duplicate — remove if unused");
      // Row 1 shows label + "Active" badge (when active) + "Duplicate"
      // marker (when another saved slot is fresher for the same
      // userID). Row 2 carries email, plan, org, and the duplicate
      // hint so users know why the row is flagged.
      items.push({
        action: "switch",
        slug: p.slug,
        iconPath: isActive ? CHECK_ICON : ACCOUNT_ICON,
        label: p.label || p.email || p.slug,
        description: isActive
          ? "Active"
          : isDuplicate
          ? "Duplicate"
          : "",
        // Every row keeps a `detail` so native row heights match —
        // prevents the mixed 1-line/2-line hover-overlap glitch.
        detail: metaParts.join(" · ") || "Saved profile",
        buttons: isActive
          ? [UPDATE_BUTTON, REMOVE_BUTTON]
          : [REMOVE_BUTTON],
      });
    }

    if (sortedProfiles.length > 0) {
      items.push({
        action: "save",
        label: "",
        kind: vscode.QuickPickItemKind.Separator,
      } as Item);
    }

    if (current.profile.signedIn && !activeSlug) {
      items.push({
        action: "save",
        iconPath: SAVE_ICON,
        label: "Save current account as profile",
        detail: "Snapshot current credentials so you can switch back later",
      });
    }
    items.push({
      action: "login",
      iconPath: LOGIN_ICON,
      label: "Log in as a new account",
      detail: "Opens /login in a new Claude terminal",
    });

    const picker = vscode.window.createQuickPick<Item>();
    picker.title = "Switch Claude account";
    picker.placeholder = savedProfiles.length
      ? "Pick an account to switch to, or add a new one"
      : "No saved profiles yet — save the current account or log in a new one";
    picker.items = items;
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;

    const pushAccountUpdate = (): void => {
      const wv2 = this.view?.webview;
      if (wv2) {
        wv2.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
      }
    };

    picker.onDidTriggerItemButton(async (e) => {
      const slug = (e.item as Item).slug;
      if (!slug) return;
      if (e.button === UPDATE_BUTTON) {
        picker.hide();
        const result = updateProfileSnapshot(slug);
        if (!result.ok) {
          vscode.window.showErrorMessage(
            `Couldn't update profile: ${result.detail ?? result.error}.`,
          );
        } else {
          vscode.window.showInformationMessage(
            `Profile "${result.data.label}" updated.`,
          );
        }
        pushAccountUpdate();
      } else if (e.button === REMOVE_BUTTON) {
        picker.hide();
        const confirm = await vscode.window.showWarningMessage(
          "Delete saved profile?",
          {
            modal: true,
            detail:
              "The snapshot (including its OAuth token copy) will be permanently removed from ~/.claude/manager-accounts. The live Claude account isn't affected.",
          },
          "Delete",
        );
        if (confirm === "Delete") {
          removeProfileSnapshot(slug);
          pushAccountUpdate();
        }
      }
    });

    picker.onDidAccept(async () => {
      const pick = picker.selectedItems[0];
      picker.hide();
      picker.dispose();
      if (!pick) return;
      if (pick.action === "switch" && pick.slug) {
        if (pick.slug === activeSlug) return;
        const targetProfile = savedProfiles.find((p) => p.slug === pick.slug);
        const confirm = await vscode.window.showWarningMessage(
          "Switch Claude account?",
          {
            modal: true,
            detail: buildSwitchConfirmDetail(targetProfile),
          },
          "Switch",
        );
        if (confirm !== "Switch") return;
        const result = switchProfileSnapshot(pick.slug);
        if (!result.ok) {
          vscode.window.showErrorMessage(
            `Switch failed: ${result.detail ?? result.error}.`,
          );
        } else {
          vscode.window.showInformationMessage(
            `Switched to ${result.data.email || result.data.label}.`,
          );
        }
        pushAccountUpdate();
      } else if (pick.action === "save") {
        void this.onMessage({ type: "promptSaveProfile" } as WebviewMessage);
      } else if (pick.action === "login") {
        // Claude CLI's /login overwrites ~/.claude.json +
        // ~/.claude/.credentials.json in place. If the live account
        // isn't backed by a saved profile, firing /login immediately
        // replaces it — the old account becomes unrecoverable short
        // of re-logging-in to it later. Force a save-first prompt so
        // users don't discover this the hard way.
        if (current.profile.signedIn && !activeSlug) {
          const choice = await vscode.window.showWarningMessage(
            "Save the current account first?",
            {
              modal: true,
              detail:
                `Logging in as a new account will overwrite ~/.claude.json and ~/.claude/.credentials.json in place — your current account (${current.profile.email || current.profile.displayName || "signed-in account"}) will be replaced, not added. Save it as a profile first so you can switch back later.`,
            },
            "Save and log in",
            "Log in anyway",
          );
          if (choice === undefined) return;
          if (choice === "Save and log in") {
            // Reuse the same input-box + disclaimer flow as the
            // Account tab's save button. Wait for the snapshot to
            // land before firing /login so the overwrite happens
            // against a safely-backed-up state.
            await this.onMessage({ type: "promptSaveProfile" } as WebviewMessage);
            // If the user aborted the label input or the disclaimer,
            // they're now looking at an unchanged home dir — still
            // bail rather than silently continuing to the login.
            const refreshed = parseAccountData(workspace || undefined);
            if (!refreshed.activeProfileSlug) return;
          }
          // choice === "Log in anyway" falls through to the login.
        }
        const term = createTerminal("Claude: login");
        term.show();
        term.sendText("claude");
        setTimeout(() => term.sendText("/login"), 1800);
      }
    });

    picker.onDidHide(() => picker.dispose());
    picker.show();
    // Keep the wv reference referenced for future ports where the
    // switcher needs to post something pre-accept (unused today).
    void wv;
  }
}
