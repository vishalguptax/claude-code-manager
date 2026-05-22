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
} from "./parser";
import { indexSession, pruneIndex } from "./searchIndex";
import { slugifyProjectPath } from "./portable";
import { PROJECTS_DIR } from "../../core/config";
import { loadState } from "./state";
import { getWorkspace } from "../../extension/workspace";
import { getCurrentBranch } from "../../extension/git";
import { isClaudeCodeExtensionInstalled } from "../../extension/claudeCodeExtension";
import { parseSkills } from "../skills/parser";
import { parseCommands } from "../commands/parser";
import { parseHooks } from "../hooks/parser";
import { parseMcpServers } from "../mcp/parser";
import { parseAgents } from "../agents/parser";
import { parseAccountData } from "../account/parser";
import type { AccountData } from "../account/types";
import { DEMO_SEEN_KEY, identityKey } from "./hostContext";
import type { Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";

/**
 * State + small callbacks the orchestration actions need. The provider
 * implements this; getters/setters keep its cached arrays authoritative.
 */
export interface ProviderActionsContext {
  readonly globalState?: vscode.Memento;
  getWebview(): vscode.Webview | undefined;
  isDisposed(): boolean;

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
        const changed = applyLiveState(ctx.getSessions(), live);
        if (!changed) return;
        wv.postMessage({
          type: "sessions",
          data: groupSessions(ctx.getSessions()),
          stats: getStats(ctx.getSessions()),
        });
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
 * Re-parse every feature's data and push a fresh snapshot without
 * recreating the webview. Tab state + scroll position are preserved
 * because only the data messages are republished.
 */
export async function reloadAll(ctx: ProviderActionsContext): Promise<void> {
  const wv = ctx.getWebview();
  if (!wv) return;

  const workspace = getWorkspace();
  const ws = workspace || undefined;

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
    wv.postMessage({ type: "mcpServers", data: mcpResult.data });
  }
  if (agentsResult.ok) {
    ctx.setAgents(agentsResult.data);
    wv.postMessage({ type: "agents", data: agentsResult.data });
  }

  ctx.refreshSettings();
  ctx.postWorkspacePath();
  wv.postMessage({ type: "reloadComplete" });
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
        "Claude Manager was interrupted while swapping accounts. The previous account's identity is still on disk as a .bak file. Restore it, discard it, or decide later.",
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
      // Best-effort cleanup; a persistent failure isn't worth surfacing.
    }
    return;
  }
  // choice === "Later" or modal dismissed — leave .bak files alone.
}
