/**
 * Host-side orchestration actions for the sessions view provider, kept
 * out of the provider so it stays a thin lifecycle coordinator.
 *
 * These are the "push fresh data to the webview" routines: full reload,
 * settings re-post, workspace-path re-post, live-state diff, the chunked
 * search-index rebuild, plus the two account-adjacent observers
 * (identity-change nudge, interrupted-swap backup sweep). Each takes a
 * `ProviderActionsContext` the provider implements, so none of them reach
 * into a provider instance's private fields directly.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  parseSessions,
  groupSessions,
  getStats,
  getUniqueProjects,
  getLastParseWarning,
  getSessionFile,
  readLiveSessions,
  applyLiveState,
  clearMetaCaches,
  clearOrphanCache,
  clearPendingCache,
} from "./parser";
import { indexSession, pruneIndex, clearIndex } from "./searchIndex";
import { slugifyProjectPath } from "./portable";
import { PROJECTS_DIR } from "../../core/config";
import { loadState } from "./state";
import { getWorkspace } from "../../extension/workspace";
import { getCurrentBranch } from "../../extension/git";
import { isClaudeCodeExtensionInstalled } from "../../extension/claudeCodeExtension";
import { parseSkills } from "../skills/parser";
import { parseCommands } from "../commands/parser";
import { parseHooks } from "../hooks/parser";
import { parseMcpServers, readMcpAuthNeeds } from "../mcp/parser";
import { parseAgents } from "../agents/parser";
import { parseAccountData } from "../account/parser";
import { clearModelCache, warmModelCache } from "../account/models";
import { resetUsageAggregateCache, warmUsageAggregate } from "../account/projectStats";
import { readQuota } from "../account/quota";
import type { AccountData } from "../account/types";
import { DEMO_SEEN_KEY, identityKey } from "./hostContext";
import type { Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";

/**
 * Config-driven features that are parsed from files on disk and can be
 * re-pushed individually by the file watchers, without a full reloadAll.
 */
export type ConfigFeature = "skills" | "commands" | "hooks" | "mcp" | "agents";

/**
 * State + small callbacks the orchestration actions need. The provider
 * implements this; getters/setters keep its cached arrays authoritative.
 */
export interface ProviderActionsContext {
  readonly globalState?: vscode.Memento;
  getWebview(): vscode.Webview | undefined;
  isDisposed(): boolean;

  /**
   * Regenerate the webview document from the html builder (fresh nonce +
   * CSP). Re-mounts the Preact app from scratch so in-memory webview state
   * is discarded and the skeletons reappear before the fresh data lands.
   * The global reload calls this last; targeted refreshes never do.
   */
  resetWebviewHtml(): void;

  getSessions(): Session[];
  setSessions(sessions: Session[]): void;
  setSkills(skills: Skill[]): void;
  setCommands(commands: Command[]): void;
  setHooks(hooks: Hook[]): void;
  setMcpServers(servers: McpServer[]): void;
  setAgents(agents: Agent[]): void;

  postWorkspacePath(): void;
  refreshSettings(): void;
  buildSearchIndex(): void;

  /** Last workspace path posted — compare-then-post to avoid churn. */
  getLastPostedWorkspace(): string | undefined;
  setLastPostedWorkspace(ws: string | undefined): void;

  /** Live-state debounce handle. */
  getLiveStateRefreshTimer(): NodeJS.Timeout | undefined;
  setLiveStateRefreshTimer(t: NodeJS.Timeout | undefined): void;

  /** Search-index rebuild generation counter (stale-build guard). */
  nextIndexBuildGen(): number;
  getIndexBuildGen(): number;

  /** Identity-change observer state. */
  getLastSeenIdentity(): string | null;
  setLastSeenIdentity(id: string | null): void;
  getIdentityToastPending(): boolean;
  setIdentityToastPending(pending: boolean): void;

  /** Re-entrant dispatch for host-initiated messages. */
  dispatch(msg: import("./types").WebviewMessage): Promise<void>;

  readonly terminals: import("./terminalRegistry").TerminalRegistry;
}

/**
 * Push the current workspace path + branch to the webview. Idempotent;
 * recovers from the cold-start race where workspaceFolders is briefly
 * undefined.
 */
export function postWorkspacePath(ctx: ProviderActionsContext, force = false): void {
  const wv = ctx.getWebview();
  if (!wv) return;
  const ws = getWorkspace();
  if (!force && ws === ctx.getLastPostedWorkspace()) return;
  ctx.setLastPostedWorkspace(ws);
  wv.postMessage({ type: "workspacePath", data: ws });
  // Send the branch alongside so the "This Branch" filter stays in sync.
  wv.postMessage({ type: "workspaceBranch", data: getCurrentBranch() });
}

/**
 * Re-parse account data and push it to the webview. Used after the async
 * model-cache warm resolves so the model dropdown fills in once the
 * background CLI scan completes (the cold sync read returns an empty list).
 */
export function refreshAccountData(ctx: ProviderActionsContext): void {
  const wv = ctx.getWebview();
  if (!wv) return;
  wv.postMessage({ type: "accountData", data: parseAccountData(getWorkspace() || undefined) });
}

/**
 * Recompute live state for every cached session and push a fresh snapshot
 * only when something changed. Debounced so heartbeat-burst writes
 * coalesce into a single UI update.
 */
export function refreshLiveState(ctx: ProviderActionsContext): void {
  const existing = ctx.getLiveStateRefreshTimer();
  if (existing) clearTimeout(existing);
  ctx.setLiveStateRefreshTimer(
    setTimeout(() => {
      ctx.setLiveStateRefreshTimer(undefined);
      const wv = ctx.getWebview();
      if (!wv) return;
      try {
        const live = readLiveSessions();
        const sessions = ctx.getSessions();

        // Self-heal: a session can go live before the FS watcher delivers its
        // transcript-create event (missed or late on some platforms, notably
        // Windows), leaving the poll with a live PID for a session absent from
        // the cached list. applyLiveState only mutates known sessions, so pull
        // the missing ones in from a fresh parse — this guarantees a newly
        // started session surfaces within one poll tick regardless of watcher
        // reliability.
        const known = new Set(sessions.map((s) => s.id));
        const missing = [...live.keys()].filter((id) => !known.has(id));
        let added = false;
        if (missing.length > 0) {
          const byId = new Map(parseSessions(loadState().renames).map((s) => [s.id, s]));
          for (const id of missing) {
            const fresh = byId.get(id);
            if (fresh) {
              sessions.push(fresh);
              added = true;
            }
          }
          if (added) sessions.sort((a, b) => b.endTime - a.endTime);
        }

        const changed = applyLiveState(sessions, live);
        if (!changed && !added) return;
        wv.postMessage({
          type: "sessions",
          data: groupSessions(sessions),
          stats: getStats(sessions),
        });
        if (added) {
          // A new session widens the project set and needs indexing for search.
          wv.postMessage({ type: "projects", data: getUniqueProjects(sessions) });
          ctx.buildSearchIndex();
        }
      } catch (err) {
        console.warn("[claude-manager] refreshLiveState failed:", err);
      }
    }, 200),
  );
}

/**
 * Build the full-text search index in the background, chunked so the
 * event loop keeps responding. A stale-generation check on every chunk
 * prevents two overlapping builds from corrupting each other.
 */
export function buildSearchIndex(ctx: ProviderActionsContext): void {
  const myGen = ctx.nextIndexBuildGen();
  const snapshot = ctx.getSessions().slice();
  // Drop stale ids (deleted sessions) but KEEP entries for unchanged
  // files — indexSession's mtime gate skips those without re-extracting.
  pruneIndex(new Set(snapshot.map((s) => s.id)));
  const CHUNK = 50;
  const processChunk = (start: number): void => {
    if (ctx.isDisposed()) return; // webview disposed — abort
    if (ctx.getIndexBuildGen() !== myGen) return; // superseded by newer build
    for (let i = start; i < Math.min(start + CHUNK, snapshot.length); i++) {
      const s = snapshot[i];
      // Prefer the parser's on-disk index — authoritative across every
      // platform/tool. projectPath-derived slug is a fallback for when
      // the index has not yet picked up a fresh write.
      const indexed = getSessionFile(s.id);
      const filePath =
        indexed ??
        (s.projectPath
          ? path.join(PROJECTS_DIR, slugifyProjectPath(s.projectPath), s.id + ".jsonl")
          : "");
      if (!filePath) continue;
      indexSession(s.id, filePath);
    }
    if (start + CHUNK < snapshot.length) {
      setTimeout(() => processChunk(start + CHUNK), 0);
    }
  };
  setTimeout(() => processChunk(0), 0);
}

/**
 * Push the current settings to the webview. Called from the initial
 * handshake and whenever VS Code settings / extension install state
 * change so the panel reacts without a reload.
 */
export function refreshSettings(ctx: ProviderActionsContext): void {
  const wv = ctx.getWebview();
  if (!wv) return;
  const sessConfig = vscode.workspace.getConfiguration("claudeManager.sessions");
  const rootConfig = vscode.workspace.getConfiguration("claudeManager");
  wv.postMessage({
    type: "settings",
    defaultFilter: sessConfig.get<string>("defaultFilter", "recent"),
    defaultProject: sessConfig.get<string>("defaultProject", "current"),
    restoreWindowMinutes: sessConfig.get<number>("restoreWindowMinutes", 30),
    // Flags the webview uses to conditionally surface extension-only
    // actions. Re-pushed on extension install/uninstall so the UI tracks
    // reality without a panel reload.
    claudeCodeExtensionInstalled: isClaudeCodeExtensionInstalled(),
    marketplaceSkillsUrl: rootConfig.get<string>(
      "marketplaceSkillsUrl",
      "https://github.com/anthropics/claude-code/wiki/Skills",
    ),
    marketplaceMcpUrl: rootConfig.get<string>("marketplaceMcpUrl", "https://mcp.so"),
    // Persisted in extension globalState so the cinematic intro auto-plays
    // exactly once per VS Code install and survives panel reloads.
    demoSeen: ctx.globalState?.get<boolean>(DEMO_SEEN_KEY) ?? false,
  });
}

/**
 * Global "full reload". This is the single path shared by the
 * `claudeManager.reload` command, its keybinding, and the shell's reload
 * button — they all funnel here so behaviour is identical. It does three
 * things, in order:
 *
 *   (a) DATA — clear every module-level parse cache (session meta + file
 *       index, orphan-transcript cache, pending-question probe, full-text
 *       search index) so the re-parse re-reads from disk cold instead of
 *       trusting stale mtime gates, then re-parse all six features and
 *       push fresh snapshots.
 *   (b) EXTENSION STATE — the fresh parse results replace the provider's
 *       cached arrays via the setters, and the search index is rebuilt
 *       from the cleared baseline.
 *   (c) WEBVIEW — regenerate `webview.html` (fresh nonce + CSP) so the
 *       Preact app re-mounts from scratch, discarding all in-memory
 *       webview state. The re-mount shows the skeletons and replays the
 *       `ready` handshake, which re-pulls the now-fresh data; persisted
 *       filters restore through the normal handshake path.
 *
 * The immediate data push (before the html reset) keeps the live-webview
 * path instant and gives the webview its data even on hosts where the
 * post-reset handshake is delayed; the html reset then supersedes the
 * button's spinner with the fresh skeleton mount. `reloadComplete` is the
 * last wire event before the reset so the webview can settle its spinner.
 */
export async function reloadAll(ctx: ProviderActionsContext): Promise<void> {
  const wv = ctx.getWebview();
  if (!wv) return;

  // (a) DATA — drop every module-level cache so the re-parse is cold.
  clearMetaCaches();
  clearOrphanCache();
  clearPendingCache();
  clearIndex();
  // Account caches the session-lifetime CLI model scan and a
  // fingerprint-memoised usage aggregate. Neither is keyed to the
  // reload button, so without these the Refresh action silently
  // returned stale model lists and stale token usage — the user's
  // explicit "give me fresh data" gesture must force a cold re-scan.
  clearModelCache();
  resetUsageAggregateCache();

  const workspace = getWorkspace();
  const ws = workspace || undefined;

  // Re-warm the expensive account inputs (async, off the event loop) before
  // the parse below so the refreshed accountData carries the full model list
  // and fresh usage totals rather than the empty placeholders the sync
  // readers return cold. Run concurrently — they touch different files.
  await Promise.allSettled([warmModelCache(), warmUsageAggregate()]);

  // Yield to the event loop between parser kickoffs so the watchdog
  // doesn't see a 200ms pause while six parsers run back-to-back on a
  // slow disk.
  const yieldEventLoop = (): Promise<void> =>
    new Promise<void>((r) => setImmediate(r));

  type ParseResult<T> = { ok: true; data: T } | { ok: false };
  const safe = async <T>(fn: () => T, label: string): Promise<ParseResult<T>> => {
    try {
      await yieldEventLoop();
      return { ok: true, data: fn() };
    } catch (err) {
      console.warn(`[claude-manager] reload ${label} failed:`, err);
      return { ok: false };
    }
  };

  const renames = loadState().renames;
  const [
    sessionsResult,
    accountResult,
    skillsResult,
    commandsResult,
    hooksResult,
    mcpResult,
    agentsResult,
  ] = await Promise.all([
    safe(() => parseSessions(renames), "sessions"),
    safe(() => parseAccountData(ws), "account"),
    safe(() => parseSkills(ws), "skills"),
    safe(() => parseCommands(ws), "commands"),
    safe(() => parseHooks(ws), "hooks"),
    safe(() => parseMcpServers(ws), "mcp"),
    safe(() => parseAgents(ws), "agents"),
  ]);

  // Re-check the webview after the awaits — disposal during reload is
  // rare but possible.
  if (ctx.isDisposed()) return;

  if (sessionsResult.ok) {
    ctx.setSessions(sessionsResult.data);
    wv.postMessage({
      type: "sessions",
      data: groupSessions(ctx.getSessions()),
      stats: getStats(ctx.getSessions()),
    });
    wv.postMessage({ type: "projects", data: getUniqueProjects(ctx.getSessions()) });
    wv.postMessage({ type: "userState", ...loadState() });
    const warning = getLastParseWarning();
    if (warning) wv.postMessage({ type: "error", message: warning });
    ctx.buildSearchIndex();
  }
  if (accountResult.ok) {
    wv.postMessage({ type: "accountData", data: accountResult.data });
  }
  // Quota rides its own message, not accountData. The webview only
  // refetches quota on mount or an account *switch*, so a Refresh that
  // re-sends the same identity would otherwise leave the quota card
  // frozen. Re-read the (free, local) statusline cache and push it so
  // Refresh updates the bars like every other card.
  wv.postMessage({ type: "quotaData", result: readQuota(ws) });
  if (skillsResult.ok) {
    ctx.setSkills(skillsResult.data);
    wv.postMessage({ type: "skills", data: skillsResult.data });
  }
  if (commandsResult.ok) {
    ctx.setCommands(commandsResult.data);
    wv.postMessage({ type: "commands", data: commandsResult.data });
  }
  if (hooksResult.ok) {
    ctx.setHooks(hooksResult.data);
    wv.postMessage({ type: "hooks", data: hooksResult.data });
  }
  if (mcpResult.ok) {
    ctx.setMcpServers(mcpResult.data);
    // Shape must be { servers, authNeeds } — a bare array resets the
    // auth-health badge to empty on the webview.
    wv.postMessage({
      type: "mcpServers",
      data: { servers: mcpResult.data, authNeeds: readMcpAuthNeeds() },
    });
  }
  if (agentsResult.ok) {
    ctx.setAgents(agentsResult.data);
    wv.postMessage({ type: "agents", data: agentsResult.data });
  }

  ctx.refreshSettings();
  ctx.postWorkspacePath();
  wv.postMessage({ type: "terminalSessions", ids: ctx.terminals.ids() });
  wv.postMessage({ type: "reloadComplete" });

  // (c) WEBVIEW — re-mount the Preact app from a freshly generated
  // document. This discards in-memory webview state and replays the
  // `ready` handshake against the now-cold caches. Done last so the
  // immediate push above isn't thrown away by the re-mount.
  ctx.resetWebviewHtml();
}

/**
 * Re-parse and push exactly one config-driven feature. The file watchers
 * call this so an edit to a SKILL.md / command / agent / settings.json /
 * mcp.json updates that tab live, without the cost (and webview re-mount)
 * of a full reloadAll. The parsers are mtime-cached, so unchanged siblings
 * are not re-read — only the file that actually changed is re-parsed.
 */
export function reloadFeature(ctx: ProviderActionsContext, feature: ConfigFeature): void {
  const wv = ctx.getWebview();
  if (!wv) return;
  const ws = getWorkspace() || undefined;
  try {
    switch (feature) {
      case "skills": {
        const data = parseSkills(ws);
        ctx.setSkills(data);
        wv.postMessage({ type: "skills", data });
        break;
      }
      case "commands": {
        const data = parseCommands(ws);
        ctx.setCommands(data);
        wv.postMessage({ type: "commands", data });
        break;
      }
      case "hooks": {
        const data = parseHooks(ws);
        ctx.setHooks(data);
        wv.postMessage({ type: "hooks", data });
        break;
      }
      case "mcp": {
        const data = parseMcpServers(ws);
        ctx.setMcpServers(data);
        // { servers, authNeeds } — preserve the auth-health badge on a
        // live .mcp.json edit (a bare array would clear it).
        wv.postMessage({
          type: "mcpServers",
          data: { servers: data, authNeeds: readMcpAuthNeeds() },
        });
        break;
      }
      case "agents": {
        const data = parseAgents(ws);
        ctx.setAgents(data);
        wv.postMessage({ type: "agents", data });
        break;
      }
    }
  } catch (err) {
    console.warn(`[claude-manager] live reload ${feature} failed:`, err);
  }
}

/**
 * Passive post-swap observer. Compares the live account-distinct identity
 * against the previously seen value and surfaces a non-blocking nudge when
 * the user logged into a brand-new account with no saved slot. Seeds the
 * identity silently on the first parse so activation never fires a
 * false-positive toast.
 */
export function checkForIdentityChange(ctx: ProviderActionsContext, data: AccountData): void {
  const liveIdentity = identityKey(data.profile.accountUuid, data.profile.email);
  if (ctx.getLastSeenIdentity() === null) {
    // First observation — seed and return silently.
    ctx.setLastSeenIdentity(liveIdentity);
    return;
  }
  if (liveIdentity === ctx.getLastSeenIdentity()) return;

  const prevIdentity = ctx.getLastSeenIdentity();
  ctx.setLastSeenIdentity(liveIdentity);

  // Logged out — the signed-out UI already shows the switcher
  // prominently, so no extra toast needed here.
  if (!liveIdentity) return;

  // New identity is already backed by a saved slot — expected switch.
  const hasSlotForNew = data.savedProfiles.some(
    (p) => identityKey(p.accountUuid, p.email) === liveIdentity,
  );
  if (hasSlotForNew) return;

  // Old identity wasn't saved either → surface the loss so the user
  // knows the previous account can't be recovered from our side.
  const hadSlotForPrev =
    !!prevIdentity &&
    data.savedProfiles.some((p) => identityKey(p.accountUuid, p.email) === prevIdentity);

  const email = data.profile.email || data.profile.displayName || "this account";
  const prelude = hadSlotForPrev
    ? `Switched to ${email}.`
    : `Switched to ${email}. The previous account wasn't saved — to restore it you'll need to re-login.`;

  // Single-toast gate: skip if a prior notification is still on screen.
  if (ctx.getIdentityToastPending()) return;
  ctx.setIdentityToastPending(true);

  void vscode.window
    .showInformationMessage(
      `${prelude} Save this account as a profile so you can switch back without re-logging-in.`,
      "Save as profile",
      "Dismiss",
    )
    .then((choice) => {
      ctx.setIdentityToastPending(false);
      if (choice === "Save as profile") {
        void ctx.dispatch({ type: "promptSaveProfile" } as import("./types").WebviewMessage);
      }
    });
}

/**
 * Detect + recover from a profile switch that crashed between the
 * `.claude.json` rewrite and the credentials write. switchProfile copies
 * the live `.claude.json` to `~/.claude.json.bak` before the rename and
 * deletes the backup on success — so its presence on startup implies an
 * interrupted swap. Prompts: Restore previous / Discard backup / Later.
 */
export async function sweepSwitchBackups(): Promise<void> {
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
        "Claude Code Manager was interrupted while swapping accounts. The previous account's identity is still on disk as a .bak file. Restore it, discard it, or decide later.",
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
        "Previous Claude account restored. Reload the Claude Code Manager panel to refresh.",
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
      // Best-effort cleanup; a persistent failure isn't worth surfacing.
    }
    return;
  }
  // choice === "Later" or modal dismissed — leave .bak files alone.
}
