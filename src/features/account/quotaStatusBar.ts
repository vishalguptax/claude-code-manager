/**
 * Status-bar quota readout — "5h 72% · 7d 40%" in place of the static
 * "Claude Code Manager" label, tinted as a window nears its cap.
 *
 * Same source as the Quota card: the statusline cache Claude Code (the
 * authorized client) writes, read locally. No network call, no OAuth
 * token (see ./quota). Falls back to the plain label whenever there is
 * nothing trustworthy to show — tap not installed, no render yet, or a
 * capture that belongs to the account the user just switched away from.
 *
 * The status bar is always visible, unlike the sidebar, so it owns its
 * own watcher instead of borrowing the webview's (which only pushes
 * while the view is resolved).
 */
import * as path from "path";
import * as vscode from "vscode";
import { CLAUDE_DIR, CLAUDE_MANAGER_DIR, STATUSLINE_CACHE_FILE } from "../../core/config";
import { getWorkspace } from "../../extension/workspace";
import { readClaudeJsonParsed } from "../../core/claudeJsonCache";
import { readQuota, type QuotaResult, type QuotaWindow } from "./quota";

/** Tint amber from here: worth knowing, not yet worth stopping for. */
export const WARN_UTILIZATION = 75;
/** Tint red from here — the same point the Quota card offers claude.ai's reset. */
export const CRITICAL_UTILIZATION = 90;

/**
 * Re-evaluate at least this often without a cache write. Two things go
 * stale while no session renders: a window's reset time passes (its
 * cached 100% is no longer true), and the user switches account. Both
 * are local reads — the cache file is tiny and ~/.claude.json is
 * mtime-cached — so a minute's lag costs nothing worth a second watcher.
 */
const RECHECK_MS = 60_000;

/** Coalesces the tap's tmp + rename burst into one read. */
const WRITE_DEBOUNCE_MS = 150;

export type QuotaSeverity = "normal" | "warning" | "critical";

export interface QuotaStatus {
  text: string;
  tooltip: string;
  severity: QuotaSeverity;
}

const LABEL: QuotaStatus = {
  text: "$(sparkle) Claude Code Manager",
  tooltip: "Open Claude Code Manager sidebar",
  severity: "normal",
};

/** A window whose reset time has passed no longer holds its cached figure. */
function hasReset(w: QuotaWindow, nowMs: number): boolean {
  return !!w.resetsAt && Date.parse(w.resetsAt) <= nowMs;
}

/**
 * "reset", not "0%": usage on claude.ai or Desktop counts against the
 * same limits but never renders Claude Code's statusline, so after a
 * reset we know the old figure is void, not what replaced it.
 */
function shortFigure(w: QuotaWindow, nowMs: number): string {
  return hasReset(w, nowMs) ? "reset" : `${Math.round(w.utilization)}%`;
}

function tooltipLine(
  label: string,
  w: QuotaWindow,
  nowMs: number,
  resetFormat: Intl.DateTimeFormatOptions,
): string {
  if (hasReset(w, nowMs)) return `${label}: reset since the last reading`;
  const used = `${label}: ${Math.round(w.utilization)}% used`;
  if (!w.resetsAt) return used;
  return `${used} · resets ${new Date(w.resetsAt).toLocaleString([], resetFormat)}`;
}

/**
 * Pure mapping from a quota read to what the status bar shows.
 * `accountSince` is when the active account last changed (0 = never
 * observed a change); a capture older than that is the previous
 * account's and must not be presented as this one's.
 */
export function describeQuotaStatus(
  result: QuotaResult,
  nowMs: number,
  accountSince: number,
): QuotaStatus {
  if (!result.ok) return LABEL;
  const { fiveHour, sevenDay, capturedAt } = result.data.quota;
  if (!fiveHour && !sevenDay) return LABEL;
  if (accountSince > 0 && Date.parse(capturedAt) < accountSince) {
    return {
      ...LABEL,
      tooltip: "Switched account — quota appears after Claude Code's next turn.",
    };
  }

  const windows: Array<[string, string, QuotaWindow, Intl.DateTimeFormatOptions]> = [];
  if (fiveHour) {
    windows.push(["5h", "5-hour window", fiveHour, { hour: "numeric", minute: "2-digit" }]);
  }
  if (sevenDay) {
    windows.push([
      "7d",
      "7-day window",
      sevenDay,
      { weekday: "short", hour: "numeric", minute: "2-digit" },
    ]);
  }

  const peak = Math.max(
    0,
    ...windows.filter(([, , w]) => !hasReset(w, nowMs)).map(([, , w]) => w.utilization),
  );
  const severity: QuotaSeverity =
    peak >= CRITICAL_UTILIZATION ? "critical" : peak >= WARN_UTILIZATION ? "warning" : "normal";

  const lines = windows.map(([, label, w, fmt]) => tooltipLine(label, w, nowMs, fmt));
  const asOf = new Date(capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  lines.push(`As of Claude Code's last render at ${asOf}.`);
  if (severity === "critical") {
    lines.push("Your plan may have a free limit reset at claude.ai → Settings → Usage.");
  }
  lines.push("Click to open Claude Code Manager.");

  return {
    text: `$(sparkle) ${windows.map(([short, , w]) => `${short} ${shortFigure(w, nowMs)}`).join(" · ")}`,
    tooltip: lines.join("\n"),
    severity,
  };
}

const BACKGROUNDS: Record<QuotaSeverity, string | undefined> = {
  normal: undefined,
  warning: "statusBarItem.warningBackground",
  critical: "statusBarItem.errorBackground",
};

function readAccountUuid(): string {
  const oauth = readClaudeJsonParsed()?.oauthAccount as Record<string, unknown> | undefined;
  return typeof oauth?.accountUuid === "string" ? oauth.accountUuid : "";
}

/** Create the status bar item and keep it current until deactivation. */
export function startQuotaStatusBar(context: vscode.ExtensionContext): void {
  // Note: VS Code status bar items only support built-in codicons ($(name)),
  // not custom SVG/PNG icons. We use "sparkle" as the closest brand-fit icon.
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "claudeManager.open";

  let accountUuid = readAccountUuid();
  let accountSince = 0;

  const update = (): void => {
    try {
      const uuid = readAccountUuid();
      if (uuid !== accountUuid) {
        accountUuid = uuid;
        accountSince = Date.now();
      }
      const status = describeQuotaStatus(
        readQuota(getWorkspace() || undefined),
        Date.now(),
        accountSince,
      );
      item.text = status.text;
      item.tooltip = status.tooltip;
      const bg = BACKGROUNDS[status.severity];
      item.backgroundColor = bg ? new vscode.ThemeColor(bg) : undefined;
    } catch (err) {
      console.warn("[claude-manager] quota status bar update failed:", err);
    }
  };

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const onCacheWrite = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(update, WRITE_DEBOUNCE_MS);
  };
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(
      vscode.Uri.file(CLAUDE_DIR),
      `${path.basename(CLAUDE_MANAGER_DIR)}/${path.basename(STATUSLINE_CACHE_FILE)}`,
    ),
  );
  watcher.onDidChange(onCacheWrite);
  watcher.onDidCreate(onCacheWrite);
  watcher.onDidDelete(onCacheWrite);
  const recheck = setInterval(update, RECHECK_MS);

  update();
  item.show();
  context.subscriptions.push(item, watcher, {
    dispose: () => {
      clearInterval(recheck);
      if (debounce) clearTimeout(debounce);
    },
  });
}
