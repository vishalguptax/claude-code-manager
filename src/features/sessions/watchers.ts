/**
 * File-watcher dispatch for the sessions view provider.
 *
 * Owns the VS Code FileSystemWatcher fleet that keeps the panel in sync
 * with ~/.claude without polling:
 *   - account files (.claude.json, settings.json, credentials) → account reparse
 *   - history.jsonl + projects/**.jsonl → session list refresh (targeted or full)
 *   - sessions/*.json (PID files) → live-state refresh
 *
 * `createWatchers(ctx)` wires every watcher and returns a single
 * Disposable that tears them all down (including pending debounce timers).
 * All extension-host state lives in `ctx`, owned by the view provider.
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
  reparseOneSession,
  readLiveSessions,
  applyLiveState,
} from "./parser";
import { loadState } from "./state";
import { getWorkspace } from "../../extension/workspace";
import { parseAccountData } from "../account/parser";
import { warmUsageAggregate } from "../account/projectStats";
import { readQuota } from "../account/quota";
import { syncActiveProfile as syncActiveProfileSnapshot } from "../account/profiles";
import type { Session } from "./types";
import type { AccountData } from "../account/types";
import type { ConfigFeature } from "./providerActions";

/**
 * Extension-host state + callbacks the watchers need. Implemented by the
 * view provider; passed in so this module stays free of any single
 * provider instance's private fields.
 */
export interface WatcherContext {
  /** The live webview, or undefined once the view is disposed. */
  getWebview(): vscode.Webview | undefined;
  /** Mutable cached session list — patched in place by the targeted path. */
  getSessions(): Session[];
  setSessions(sessions: Session[]): void;
  /** Re-post the workspace path + branch (idempotent). */
  postWorkspacePath(): void;
  /** Kick the background full-text index rebuild. */
  buildSearchIndex(): void;
  /** Debounced live-state diff + push. */
  refreshLiveState(): void;
  /** Surface the identity-change nudge after an account reparse. */
  checkForIdentityChange(data: AccountData): void;
  /** Re-parse + re-push a single config-driven feature (skills, etc.). */
  reloadConfigFeature(feature: ConfigFeature): void;
}

/**
 * Threshold above which a transcript-flood falls back to full reparse.
 * A burst of >10 transcript changes inside one debounce window almost
 * always means a project import / restore — full reparse is faster than
 * 10+ targeted updates.
 */
const TRANSCRIPT_FLOOD_THRESHOLD = 10;

/**
 * Extract `<sessionId>` from `…/projects/<slug>/<sessionId>.jsonl`.
 * Returns null when the path is not a transcript file (e.g. history.jsonl
 * or a non-jsonl path).
 */
function sessionIdFromTranscriptPath(filePath: string): string | null {
  if (!filePath.endsWith(".jsonl")) return null;
  const base = path.basename(filePath, ".jsonl");
  if (!base || base === "history") return null;
  return base;
}

/**
 * Wire every FileSystemWatcher and return a Disposable that tears them
 * all down. Uses VS Code's native FileSystemWatcher (no polling).
 * Debounces re-parses so rapid saves / heartbeat bursts coalesce.
 */
export function createWatchers(ctx: WatcherContext): vscode.Disposable {
  const watchers: vscode.FileSystemWatcher[] = [];
  let accountReparseTimer: NodeJS.Timeout | undefined;
  let sessionsReparseTimer: NodeJS.Timeout | undefined;
  let quotaCacheTimer: NodeJS.Timeout | undefined;
  const pendingSessionPaths = new Set<string>();

  // Usage re-push throttle. The usage payload is recomputed from a full
  // account parse (reads ~9 files + stats every transcript), so doing it on
  // every transcript append — which fire every second or two while Claude
  // generates — was a real CPU/IO drag. Token usage doesn't need sub-second
  // freshness; cap the refresh to once per window. `0` lets the first one
  // through immediately.
  const USAGE_PUSH_THROTTLE_MS = 10_000;
  let lastUsagePushAt = 0;

  // Account-relevant files live in ~/.claude/ and ~/.claude.json.
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

  /** Bind change/create/delete to a single URI-aware handler. */
  const bindAll = (
    w: vscode.FileSystemWatcher,
    handler: (uri: vscode.Uri) => void,
  ): void => {
    w.onDidChange(handler);
    w.onDidCreate(handler);
    w.onDidDelete(handler);
  };

  const onAccountChange = (): void => {
    if (accountReparseTimer) clearTimeout(accountReparseTimer);
    accountReparseTimer = setTimeout(() => {
      const wv = ctx.getWebview();
      try {
        // Mirror live token rotations into the saved slot. Anthropic
        // single-use rotates refresh tokens, so a slot whose snapshot
        // pre-dates the latest rotation will 401 on a future switch.
        // No-op when no slot matches the live identity. Best-effort:
        // a write failure here must not block the reparse + UI push.
        try {
          syncActiveProfileSnapshot();
        } catch (err) {
          console.warn("[claude-manager] sync active profile failed:", err);
        }
        const ws = getWorkspace();
        const data = parseAccountData(ws || undefined);
        // Identity-change detection: when the live userID shifts
        // (manual CLI /login replaced the account behind our back),
        // nudge the user to save the new account as a profile so
        // the next login doesn't wipe it too. Silent when the new
        // account already has a saved slot — that's a known
        // identity and no prompt is useful.
        ctx.checkForIdentityChange(data);
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
    bindAll(watcher, onAccountChange);
    watchers.push(watcher);
  }

  // Lightweight account re-push for the session-data path. Token usage is
  // aggregated from the transcripts and shipped inside `accountData`, but
  // the account watcher above only fires on settings/credentials/stats-
  // cache writes — never on a transcript append. Without this, the Usage
  // tab stayed frozen for the whole of an active session. Skips the
  // profile-sync + identity-change side effects of `onAccountChange`:
  // those belong to credential writes, not to ordinary token activity.
  // The usage aggregate is fingerprint-memoised, so when nothing actually
  // grew this recomputes nothing and just re-ships the cached payload.
  // Awaits the async aggregate warm first so the pushed payload reflects the
  // just-appended tokens — the read runs off the event loop, so this never
  // blocks the host the way the old synchronous whole-corpus read did.
  const pushAccountUsage = async (): Promise<void> => {
    const wv = ctx.getWebview();
    if (!wv) return;
    try {
      await warmUsageAggregate();
      if (!ctx.getWebview()) return;
      const data = parseAccountData(getWorkspace() || undefined);
      wv.postMessage({ type: "accountData", data });
    } catch (err) {
      console.warn("[claude-manager] usage re-push failed:", err);
    }
  };

  // ── Quota watcher ──
  // The statusline tap rewrites ~/.claude/.claude-manager/statusline.json
  // on every Claude Code render (via tmp + rename). Watch it so the Quota
  // + Current Session cards refresh live — matching the terminal
  // statusline — instead of only updating on tab mount / manual Refresh.
  // No network, no polling: purely reacting to the cache the authorized
  // client wrote. Debounced to coalesce the tmp/rename burst.
  const quotaCachePattern = new vscode.RelativePattern(
    vscode.Uri.file(claudeDir),
    ".claude-manager/statusline.json",
  );
  const onQuotaCacheChange = (): void => {
    if (quotaCacheTimer) clearTimeout(quotaCacheTimer);
    quotaCacheTimer = setTimeout(() => {
      const wv = ctx.getWebview();
      if (!wv) return;
      try {
        // Threaded workspace so the installed-check sees project/local
        // statusline scopes — matters when the tap is wired there.
        const workspace = getWorkspace() || undefined;
        wv.postMessage({ type: "quotaData", result: readQuota(workspace) });
      } catch (err) {
        console.warn("[claude-manager] quota cache push failed:", err);
      }
    }, 150);
  };
  const quotaWatcher = vscode.workspace.createFileSystemWatcher(quotaCachePattern);
  bindAll(quotaWatcher, onQuotaCacheChange);
  watchers.push(quotaWatcher);

  // ── Session data watchers ──
  // history.jsonl is split out from the projects watcher so the
  // dispatch logic can pick the cheap path (single-session reparse)
  // when only a transcript file changed, and fall back to a full
  // reparse only when history.jsonl moved or a flood of transcripts
  // tripped the threshold.
  const historyPattern = new vscode.RelativePattern(
    vscode.Uri.file(claudeDir),
    "history.jsonl",
  );
  const transcriptPattern = new vscode.RelativePattern(
    vscode.Uri.file(path.join(claudeDir, "projects")),
    "**/*.jsonl",
  );
  // Watch the PID-file directory directly so session-start, heartbeat
  // rewrites, and PID-file deletions trigger an immediate `isLive`
  // refresh on every cached session — not just the one whose
  // transcript happened to flush. This is the fix for the
  // multi-window inconsistency where the green dot would only show
  // on whichever session most recently wrote JSONL.
  const livePidPattern = new vscode.RelativePattern(
    vscode.Uri.file(path.join(claudeDir, "sessions")),
    "*.json",
  );

  /** Full reparse path — the smart watcher falls back to this. */
  const fullSessionsReparse = (): void => {
    const wv = ctx.getWebview();
    if (!wv) return;
    ctx.setSessions(parseSessions(loadState().renames));
    ctx.postWorkspacePath();
    wv.postMessage({
      type: "sessions",
      data: groupSessions(ctx.getSessions()),
      stats: getStats(ctx.getSessions()),
    });
    wv.postMessage({ type: "projects", data: getUniqueProjects(ctx.getSessions()) });
    const warning = getLastParseWarning();
    if (warning) wv.postMessage({ type: "error", message: warning });
    ctx.buildSearchIndex();
  };

  const onSessionChange = (uri: vscode.Uri): void => {
    pendingSessionPaths.add(uri.fsPath);
    if (sessionsReparseTimer) clearTimeout(sessionsReparseTimer);
    sessionsReparseTimer = setTimeout(() => {
      const paths = Array.from(pendingSessionPaths);
      pendingSessionPaths.clear();
      const wv = ctx.getWebview();
      if (!wv) return;

      const historyChanged = paths.some((p) =>
        p.endsWith(`${path.sep}history.jsonl`) || p.endsWith("/history.jsonl"),
      );
      const transcriptPaths = paths.filter(
        (p) => p.endsWith(".jsonl") && !p.endsWith("history.jsonl"),
      );

      try {
        if (historyChanged || transcriptPaths.length > TRANSCRIPT_FLOOD_THRESHOLD) {
          fullSessionsReparse();
          return;
        }
        // Targeted path: single transcript changed. Re-parse only
        // that session and merge into the cached list. Sibling
        // sessions keep their cached meta — the whole point of the
        // smart watcher.
        const renames = loadState().renames;
        const sessions = ctx.getSessions();
        let mutated = false;
        for (const filePath of transcriptPaths) {
          const id = sessionIdFromTranscriptPath(filePath);
          if (!id) continue;
          const fresh = reparseOneSession(id, renames);
          if (!fresh) {
            // Session was deleted — drop it from the cache.
            const idx = sessions.findIndex((s) => s.id === id);
            if (idx >= 0) {
              sessions.splice(idx, 1);
              mutated = true;
            }
            continue;
          }
          const idx = sessions.findIndex((s) => s.id === id);
          if (idx >= 0) sessions[idx] = fresh;
          else sessions.push(fresh);
          mutated = true;
        }
        // Even if the targeted reparse didn't mutate the list,
        // sibling sessions' live state may have shifted since the
        // last tick (a parallel CLI started/exited without touching
        // *this* transcript). Sync them from a fresh PID-file scan
        // so the dot stays correct across all windows.
        applyLiveState(sessions, readLiveSessions());
        if (!mutated) {
          // Live-state may still have changed — let refreshLiveState
          // diff + push if needed. It debounces so chaining is safe.
          ctx.refreshLiveState();
          return;
        }
        sessions.sort((a, b) => b.endTime - a.endTime);
        wv.postMessage({
          type: "sessions",
          data: groupSessions(sessions),
          stats: getStats(sessions),
        });
        wv.postMessage({ type: "projects", data: getUniqueProjects(sessions) });
        ctx.buildSearchIndex();
      } catch (err) {
        console.warn("[claude-manager] sessions reparse failed:", err);
      } finally {
        // Runs on every exit branch (full reparse, targeted, no-op) so a
        // transcript append refreshes the Usage tab even when the session
        // list itself didn't reorder — but throttled, since the usage
        // payload is expensive to recompute and doesn't need to track every
        // token in real time.
        const now = Date.now();
        if (now - lastUsagePushAt >= USAGE_PUSH_THROTTLE_MS) {
          lastUsagePushAt = now;
          void pushAccountUsage();
        }
      }
    }, 1000);
  };

  const historyWatcher = vscode.workspace.createFileSystemWatcher(historyPattern);
  bindAll(historyWatcher, onSessionChange);
  watchers.push(historyWatcher);

  const transcriptWatcher = vscode.workspace.createFileSystemWatcher(transcriptPattern);
  bindAll(transcriptWatcher, onSessionChange);
  watchers.push(transcriptWatcher);

  const livePidWatcher = vscode.workspace.createFileSystemWatcher(livePidPattern);
  bindAll(livePidWatcher, () => ctx.refreshLiveState());
  watchers.push(livePidWatcher);

  // ── Config-artifact watchers (skills / commands / agents / mcp / hooks) ──
  // These tabs read plain files under ~/.claude and the workspace .claude/.
  // Nothing writes them but the user (or a plugin install) — no Claude
  // session, no statusline tap — so a file watcher is all that's needed
  // for them to update live for any user, regardless of whether Claude is
  // running. The parsers are mtime-cached, so a reparse only re-reads the
  // file that actually changed. Per-feature debounce coalesces the burst an
  // editor emits on save (write + atomic-rename + attribute touch).
  const CONFIG_DEBOUNCE_MS = 250;
  const configTimers = new Map<ConfigFeature, NodeJS.Timeout>();
  const scheduleConfigReload = (feature: ConfigFeature): void => {
    const existing = configTimers.get(feature);
    if (existing) clearTimeout(existing);
    configTimers.set(
      feature,
      setTimeout(() => {
        configTimers.delete(feature);
        ctx.reloadConfigFeature(feature);
      }, CONFIG_DEBOUNCE_MS),
    );
  };

  const claudeUri = vscode.Uri.file(claudeDir);
  const configPatterns: Array<{ feature: ConfigFeature; pattern: vscode.RelativePattern }> = [
    // Global (~/.claude). claudeDir is already symlink-resolved above.
    { feature: "skills", pattern: new vscode.RelativePattern(vscode.Uri.file(path.join(claudeDir, "skills")), "**/SKILL.md") },
    { feature: "commands", pattern: new vscode.RelativePattern(vscode.Uri.file(path.join(claudeDir, "commands")), "**/*.{md,toml}") },
    { feature: "agents", pattern: new vscode.RelativePattern(vscode.Uri.file(path.join(claudeDir, "agents")), "**/*.md") },
    { feature: "mcp", pattern: new vscode.RelativePattern(claudeUri, "mcp.json") },
    // NB: ~/.claude.json (where user-scope MCP servers live) is intentionally
    // NOT watched here — Claude rewrites it constantly during normal use, so
    // re-parsing that large file on every change would be wasteful for a
    // rarely-edited list. The MCP tab picks up changes on reload/mount.
    { feature: "hooks", pattern: new vscode.RelativePattern(claudeUri, "settings.json") },
    // settings.json also carries the disabledMcpjsonServers / enabledMcpjsonServers
    // arrays that toggle project .mcp.json servers, so an external edit must
    // also refresh the MCP tab's enabled/disabled state.
    { feature: "mcp", pattern: new vscode.RelativePattern(claudeUri, "settings.json") },
  ];
  if (workspace) {
    configPatterns.push(
      { feature: "skills", pattern: new vscode.RelativePattern(workspace, ".claude/skills/**/SKILL.md") },
      { feature: "commands", pattern: new vscode.RelativePattern(workspace, ".claude/commands/**/*.{md,toml}") },
      { feature: "agents", pattern: new vscode.RelativePattern(workspace, ".claude/agents/**/*.md") },
      { feature: "mcp", pattern: new vscode.RelativePattern(workspace, ".mcp.json") },
      { feature: "hooks", pattern: new vscode.RelativePattern(workspace, ".claude/settings.json") },
      { feature: "hooks", pattern: new vscode.RelativePattern(workspace, ".claude/settings.local.json") },
      // Project/local settings hold the MCP toggle arrays too — refresh
      // the MCP tab when they change.
      { feature: "mcp", pattern: new vscode.RelativePattern(workspace, ".claude/settings.json") },
      { feature: "mcp", pattern: new vscode.RelativePattern(workspace, ".claude/settings.local.json") },
    );
  }
  for (const { feature, pattern } of configPatterns) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    bindAll(watcher, () => scheduleConfigReload(feature));
    watchers.push(watcher);
  }

  return {
    dispose(): void {
      if (accountReparseTimer) clearTimeout(accountReparseTimer);
      accountReparseTimer = undefined;
      if (sessionsReparseTimer) clearTimeout(sessionsReparseTimer);
      sessionsReparseTimer = undefined;
      if (quotaCacheTimer) clearTimeout(quotaCacheTimer);
      quotaCacheTimer = undefined;
      for (const t of configTimers.values()) clearTimeout(t);
      configTimers.clear();
      for (const w of watchers) w.dispose();
      watchers.length = 0;
    },
  };
}
