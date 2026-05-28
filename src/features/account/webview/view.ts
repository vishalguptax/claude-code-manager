/**
 * Account tab view — renders profile, usage, settings, and permissions sections.
 * All sections are collapsible via clickable headers.
 */

import { icon } from "../../../webview/icons";
import { esc } from "../../../webview/utils";
import { renderSelect, bindSelect } from "../../../webview/components/select";
import {
  sendLaunchSlash,
  sendOpenAccountUrl,
  sendOpenSettingsFile,
  sendSetCommitAttribution,
  sendSetModel,
  sendSetPrAttribution,
  sendSetVoiceEnabled,
  sendPromptAddPermission,
  sendRemovePermission,
  sendPromptCustomModel,
  sendRestoreClaudeConfig,
  sendFetchQuota,
  sendInstallStatusline,
  sendPromptSaveProfile,
  sendOpenAccountSwitcher,
} from "./api";
import {
  getAccountData,
  getPermissionScope,
  getTimePeriod,
  getQuotaStatus,
  isLoading,
  isSectionCollapsed,
  setPermissionScope,
  setQuotaStatus,
  setTimePeriod,
  toggleSection,
} from "./state";
import type {
  AccountData,
  DailyActivity,
  DailyTokens,
  PermissionScope,
  UsageStats,
} from "../types";
import type { LiveSession, QuotaSuccess, QuotaWindow, QuotaError } from "../quota";
import {
  buildHeatmap,
  cutoffDaysForPeriod,
  type HeatmapCell,
} from "./heatmap";

/**
 * Short purpose descriptions keyed by model family alias. Shown as a
 * helper line under the model dropdown so users see the same context
 * Claude's /model picker shows in the terminal. Only family aliases —
 * no version numbers — so nothing goes stale when Claude bumps a model.
 */
const MODEL_DESCRIPTIONS: Record<string, string> = {
  default: "1M context · most capable",
  sonnet: "Balanced daily driver",
  haiku: "Fastest, lightest",
  opus: "Deepest reasoning",
};

/** A single dropdown option in the model selector. */
interface ModelOption {
  value: string;
  label: string;
  desc: string;
}

/**
 * Build the model dropdown options purely from the CLI binary scan —
 * no hardcoded fallback, no stats-cache guesses, no "Custom..." typed-
 * input escape hatch. The dropdown reflects exactly what the installed
 * Claude CLI supports today.
 *
 *   - Latest of each family binds to the alias ("opus", "sonnet", ...)
 *     so the user auto-upgrades when Claude bumps that family.
 *   - Older versions bind to the full ID ("claude-opus-4-6") so users
 *     who want to pin to a specific release can do so explicitly.
 *   - If the user's current model isn't in the discovered list (e.g.
 *     they hand-edited settings.json to a value from an older CLI),
 *     we still surface it as a read-only entry so the trigger label
 *     renders correctly instead of blank.
 */
function buildModelOptions(
  data: AccountData,
  currentModel: string,
): ModelOption[] {
  // "Default" in Claude CLI resolves to the latest Opus (+ 1M context).
  // Surface that version in the label so users see what Default is today.
  const latestOpus = data.availableModels.find(
    (m) => m.alias === "opus" && m.isLatest,
  );
  const defaultLabel = latestOpus
    ? `Default (${latestOpus.label})`
    : "Default";

  const options: ModelOption[] = [
    { value: "default", label: defaultLabel, desc: MODEL_DESCRIPTIONS.default },
  ];
  const seen = new Set<string>(["default"]);

  for (const m of data.availableModels) {
    const value = m.isLatest ? m.alias : m.id;
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({
      value,
      label: m.label,
      desc: m.isLatest
        ? MODEL_DESCRIPTIONS[m.alias] ?? ""
        : "Pinned",
    });
  }

  // Current model not in the discovered list — surface it so the
  // trigger label renders. No "Custom model…" typed-input: the
  // dropdown shows only what exists.
  if (currentModel && !seen.has(currentModel)) {
    options.push({
      value: currentModel,
      label: formatModelName(currentModel),
      desc: "",
    });
  }

  return options;
}

/** Build a lookup from option value → description for the change handler. */
function buildModelDescMap(options: ModelOption[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of options) map[o.value] = o.desc;
  return map;
}

/** Render the entire account tab into the given container. */
export function renderAccount(container: HTMLElement): void {
  if (isLoading() && !getAccountData()) {
    container.innerHTML = `<div class="panel"><div class="loading">Loading account...</div></div>`;
    return;
  }

  const data = getAccountData();
  if (!data) {
    container.innerHTML = `<div class="panel"><div class="empty">No account data available. Make sure Claude Code is installed and you're signed in.</div></div>`;
    return;
  }

  // Preserve scroll position across re-renders (tab switches, toggles, etc.)
  const existingPanel = container.querySelector<HTMLElement>(".panel");
  const scrollTop = existingPanel?.scrollTop ?? 0;

  container.innerHTML = `
    <div class="panel">
      ${renderProfileSection(data)}
      ${renderQuotaSection()}
      ${renderLiveSection()}
      ${renderUsageSection(data)}
    </div>`;

  // Restore scroll position after DOM replacement
  const newPanel = container.querySelector<HTMLElement>(".panel");
  if (newPanel && scrollTop > 0) {
    newPanel.scrollTop = scrollTop;
  }

  bindHandlers(container, data);
}

// ── Section: Profile ──

function renderProfileSection(data: AccountData): string {
  const p = data.profile;
  const collapsed = isSectionCollapsed("profile");

  if (!p.signedIn) {
    // Signed-out path after /logout. When the user has saved profiles,
    // show them as the primary affordance — switching restores a
    // whole identity without a browser round-trip. Without this, the
    // only exit from the signed-out state was /login, which re-auths
    // from scratch and doesn't reach the saved snapshots. Users who
    // had saved profiles wondered why logout plus a switch didn't
    // work; the switcher was literally unreachable from the UI.
    const saved = data.savedProfiles;
    return `
      <section class="acct-section">
        ${renderSectionHeader("profile", "Profile", collapsed)}
        ${collapsed ? "" : `
        <div class="acct-section-body">
          <div class="acct-empty">
            <div class="acct-empty-title">Not signed in</div>
            <div class="acct-empty-hint">${saved.length > 0 ? `Switch to a saved account or log in a new one.` : `Sign in to Claude Code to view your account.`}</div>
            <div class="acct-actions">
              ${saved.length > 0 ? `<button class="btn primary" id="acct-switch-account" title="Switch to a saved Claude account">${icon("refresh-cw", 14)} Switch account</button>` : ""}
              <button class="btn ${saved.length > 0 ? "" : "green"}" data-slash="/login">${icon("play", 14)} Log in</button>
            </div>
          </div>
        </div>`}
      </section>`;
  }

  const initial = (p.displayName || p.email || "?").charAt(0).toUpperCase();
  const expiresInDays =
    p.tokenExpiresAt > 0 ? Math.round((p.tokenExpiresAt - Date.now()) / 86400000) : 0;

  return `
    <section class="acct-section">
      ${renderSectionHeader("profile", "Profile", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        ${p.configCorrupted ? `
        <div class="acct-banner" role="alert">
          ${icon("circle-alert", 14)}
          <div class="acct-banner-text">
            <strong>Claude config looks corrupted.</strong>
            <span>~/.claude.json is empty or invalid. Restore from the latest backup to avoid Claude's re-login prompt and keep your settings.</span>
          </div>
          <button class="btn" id="acct-restore-config">${icon("refresh-cw", 12)} Restore</button>
        </div>` : ""}
        <div class="acct-profile">
          <button class="acct-avatar acct-avatar-btn" id="acct-avatar-switch"
            title="Switch account" aria-label="Switch account">${esc(initial)}</button>
          <div class="acct-profile-info">
            <div class="acct-name">${esc(p.displayName || p.email || (p.signedIn ? "Signed in" : "Not signed in"))}</div>
            <div class="acct-email">${esc(p.email)}</div>
          </div>
          ${p.subscriptionType ? `<span class="acct-plan-badge plan-${esc(p.subscriptionType)}">${esc(p.subscriptionType)}</span>` : ""}
        </div>

        ${expiresInDays > 0 || p.credentialSource ? `
        <div class="acct-meta">
          ${expiresInDays > 0 ? `<div class="acct-meta-row"><span class="acct-meta-k">Session expires</span><span class="acct-meta-v">in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}</span></div>` : ""}
          ${p.credentialSource ? `<div class="acct-meta-row"><span class="acct-meta-k">Credentials</span><span class="acct-meta-v" title="${p.credentialSource === "keychain-darwin" ? "Tokens stored in macOS Keychain. First read prompts for permission per IDE." : "Tokens stored in ~/.claude/.credentials.json (file mode 0600)."}">${p.credentialSource === "keychain-darwin" ? "macOS Keychain" : "File"}</span></div>` : ""}
        </div>` : ""}

        <div class="acct-actions">
          <button class="btn" id="acct-switch-account" title="Switch between saved Claude accounts or log in a new one">${icon("refresh-cw", 14)} Switch account</button>
          ${!data.activeProfileSlug ? `<button class="btn" id="acct-save-profile" title="Save this account as a profile so you can switch back without re-logging-in">${icon("save", 14)} Save profile</button>` : ""}
          <button class="btn del" data-slash="/logout">${icon("x", 14)} Log out</button>
          <button class="btn" data-url="https://claude.ai/settings">${icon("external-link", 14)} Open claude.ai</button>
        </div>
      </div>`}
    </section>`;
}

// ── Section: Quota (current subscription limits) ──
//
// Quota lives in its own section between Profile and Usage because it
// answers a different question: "how much of my subscription window
// have I already consumed". Profile is identity, Usage is history;
// Quota is the live "can I keep going for the next hour" signal.
//
// Fetching quota is the ONLY network call Claude Manager makes — so
// the card is explicitly opt-in: an "idle" state renders a Refresh
// button rather than auto-loading on tab open. This preserves the
// extension's 100%-local-by-default posture while still offering the
// number when users want it.

/**
 * Turn an ISO timestamp into a human-readable "resets in" string.
 * Avoids showing tiny "resets in 42m" at the wrong scale — rounds to
 * days when >=24h, hours when >=1h, otherwise shows minutes.
 */
// A reset time in the past means the cached window already rolled over
// since Claude Code last rendered — the figure is stale, not "resetting
// now". Surface staleness instead of a misleading countdown.
function formatResetsIn(isoResetsAt: string): string {
  if (!isoResetsAt) return "";
  const resetMs = Date.parse(isoResetsAt);
  if (Number.isNaN(resetMs)) return "";
  const diffMs = resetMs - Date.now();
  if (diffMs <= 0) return "outdated · open Claude to refresh";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `resets in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const leftoverMin = mins % 60;
    return leftoverMin > 0
      ? `resets in ${hours}h ${leftoverMin}m`
      : `resets in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const leftoverHours = hours % 24;
  return leftoverHours > 0
    ? `resets in ${days}d ${leftoverHours}h`
    : `resets in ${days}d`;
}

/**
 * ISO 4217 minor-unit decimal count for a currency code. The OAuth
 * /usage endpoint returns `used_credits` / `monthly_limit` in the
 * currency's minor unit (cents, fils, etc.), so we divide the raw
 * integer by 10^digits before rendering. Zero-decimal currencies (JPY,
 * KRW, …) and three-decimal currencies (BHD, KWD, …) both occur in
 * the wild — treating everything as two decimals showed AUD users
 * "23346.00 AUD" instead of "233.46".
 *
 * List mirrors the ISO 4217 standard. Missing currencies fall back
 * to 2 digits, which matches every mainstream currency and the
 * Intl.NumberFormat default.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW",
  "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF",
  "XPF", "XAG", "XAU", "XDR", "XSU", "XUA",
]);
const THREE_DECIMAL_CURRENCIES = new Set([
  "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
]);
const FOUR_DECIMAL_CURRENCIES = new Set(["CLF", "UYW"]);

function currencyFractionDigits(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  if (FOUR_DECIMAL_CURRENCIES.has(code)) return 4;
  return 2;
}

/**
 * Render a minor-unit integer as a locale-formatted currency string.
 * Uses Intl.NumberFormat with the caller-supplied currency code so
 * symbol placement, decimal/thousands separators, and spacing all
 * match the user's region — we don't hardcode "$" for USD anymore.
 * Falls back to a plain `${major} ${currency}` render if Intl
 * rejects the code (very old runtimes, unknown ISO code).
 */
function formatMoney(minorUnits: number, currency: string): string {
  const digits = currencyFractionDigits(currency);
  const major = minorUnits / Math.pow(10, digits);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(major);
  } catch {
    return `${major.toFixed(digits)} ${currency}`;
  }
}

/**
 * Utilization colour classes — three tiers so the bar changes mood as
 * the user approaches their cap. Semantic tokens only; exact colours
 * live in the CSS so theme changes pick them up.
 */
function quotaTone(utilizationPct: number): "low" | "mid" | "high" {
  if (utilizationPct >= 80) return "high";
  if (utilizationPct >= 50) return "mid";
  return "low";
}

/**
 * Render a single "window" row: label, progress bar, percentage, and
 * the human reset timer. The bar has an accessible `role=progressbar`
 * with value/max attributes so screen readers announce the percentage
 * without needing a visual scan.
 */
function renderQuotaBar(label: string, win: QuotaWindow): string {
  const pct = Math.max(0, Math.min(100, Math.round(win.utilization)));
  const tone = quotaTone(win.utilization);
  const resetsLabel = formatResetsIn(win.resetsAt);
  return `
    <div class="acct-quota-row">
      <div class="acct-quota-row-head">
        <span class="acct-quota-label">${esc(label)}</span>
        <span class="acct-quota-pct">${pct}%</span>
      </div>
      <div class="acct-quota-bar" role="progressbar"
        aria-label="${esc(label)} utilization"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="acct-quota-bar-fill tone-${tone}" style="width: ${pct}%;"></div>
      </div>
      ${resetsLabel ? `<div class="acct-quota-sub">${esc(resetsLabel)}</div>` : ""}
    </div>`;
}

/**
 * Render the inner body for each quota state. Kept as a function so
 * the container shell (header, footer actions) stays small and
 * readable in renderQuotaSection.
 */
function renderQuotaBody(): string {
  const status = getQuotaStatus();

  if (status.kind === "idle" || status.kind === "loading") {
    return `
      <div class="acct-quota-loading" aria-live="polite">
        <span class="acct-quota-spinner" aria-hidden="true"></span>
        <span>Reading quota…</span>
      </div>`;
  }

  if (status.kind === "error") {
    return status.error.kind === "not-installed"
      ? renderQuotaInstall(status.error)
      : renderQuotaNotice(status.error);
  }

  return renderQuotaSuccess(status.data);
}

/** Not-installed state — the opt-in CTA that wires the statusline tap. */
function renderQuotaInstall(err: QuotaError): string {
  return `
    <div class="acct-quota-intro">
      <p class="acct-quota-intro-text">
        Show how much of your 5-hour and 7-day limits you've used — read locally
        from Claude Code, with no network call. ${esc(err.message)} Enabling wires
        Claude Code's statusline to a small tap that caches the figures; your
        existing statusline is preserved, and you can disable it anytime.
      </p>
      <button class="btn primary" id="acct-quota-install">
        ${icon("terminal-square", 14)} Enable live quota
      </button>
    </div>`;
}

/** Render the populated quota card — the 5h + 7d bars. */
function renderQuotaSuccess(data: QuotaSuccess): string {
  const { fiveHour, sevenDay } = data.quota;
  if (!fiveHour && !sevenDay) {
    return `
      <p class="acct-quota-intro-text">
        No rate-limit data in the last statusline render. Open a Claude Code
        session, then refresh.
      </p>`;
  }
  const rows: string[] = [];
  if (fiveHour) rows.push(renderQuotaBar("5-hour window", fiveHour));
  if (sevenDay) rows.push(renderQuotaBar("7-day window", sevenDay));
  return `<div class="acct-quota-bars">${rows.join("")}</div>`;
}

/**
 * "No data yet" notice — installed, but Claude Code hasn't rendered its
 * statusline since (or the cache was missing/corrupt). The message is
 * human-crafted in quota.ts so we surface it verbatim.
 */
function renderQuotaNotice(err: QuotaError): string {
  return `
    <div class="acct-quota-error" role="status">
      <span class="acct-quota-error-icon">${icon("refresh-cw", 16)}</span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Waiting for Claude Code</div>
        <div class="acct-quota-error-msg">${esc(err.message)}</div>
      </div>
      <button class="btn" id="acct-quota-fetch">
        ${icon("refresh-cw", 12)} Refresh
      </button>
    </div>`;
}

/** Format "Fetched Xm ago" relative to now — tight, scanable. */
function formatFetchedRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "just now";
  const diff = Date.now() - t;
  if (diff < 10_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return `${Math.floor(diff / 1000)}s ago`;
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

function renderQuotaSection(): string {
  const collapsed = isSectionCollapsed("quota");
  const status = getQuotaStatus();
  // Stamp shows when Claude Code last rendered its statusline (capture
  // time) — the figure users care about, not when we read the file.
  // Sits in the header beside Refresh; no bottom footer needed.
  const captured = status.kind === "success" ? status.data.quota.capturedAt : "";
  const timestamp = captured
    ? `<span class="acct-quota-timestamp" title="${esc(captured)}">${esc(formatFetchedRelative(captured))}</span>`
    : "";
  const refreshBtn =
    status.kind === "idle"
      ? ""
      : `<button class="acct-section-head-btn ${status.kind === "loading" ? "is-spinning" : ""}"
           id="acct-quota-fetch"
           title="Refresh quota"
           aria-label="Refresh quota"
           ${status.kind === "loading" ? "disabled" : ""}>
           ${icon("refresh-cw", 12)}
         </button>`;
  return `
    <section class="acct-section">
      <header class="acct-section-header" data-section="quota"
        role="button" tabindex="0" aria-expanded="${!collapsed}">
        <span class="acct-section-chevron ${collapsed ? "collapsed" : ""}">${icon("chevron-down", 14)}</span>
        <h2 class="acct-section-title">Quota</h2>
        ${timestamp}
        ${refreshBtn}
      </header>
      ${collapsed ? "" : `
      <div class="acct-section-body">
        ${renderQuotaBody()}
      </div>`}
    </section>`;
}

// ── Section: Current session ──

/**
 * Live session metrics from the same statusline cache as Quota: active
 * model, context-window usage, and cost. Reflects the most recently
 * active Claude Code session. Hidden entirely when the cache holds no
 * session metrics, so it never shows an empty shell.
 */
function renderLiveSection(): string {
  const status = getQuotaStatus();
  if (status.kind !== "success") return "";
  const live = status.data.live;
  const hasLive =
    live.model !== "" || live.contextUsedPercent !== null || live.sessionCostUsd !== null;
  if (!hasLive) return "";

  const metaRow = (k: string, v: string): string =>
    `<div class="acct-meta-row"><span class="acct-meta-k">${esc(k)}</span><span class="acct-meta-v">${esc(v)}</span></div>`;

  const rows: string[] = [];
  if (live.model) rows.push(metaRow("Model", live.model));
  if (live.contextUsedPercent !== null) {
    const pct = `${Math.round(live.contextUsedPercent)}%`;
    rows.push(metaRow("Context", live.contextSize ? `${pct} of ${formatNumber(live.contextSize)}` : pct));
  }
  if (live.sessionCostUsd !== null) {
    rows.push(metaRow("Session cost", `$${live.sessionCostUsd.toFixed(2)}`));
  }
  if (live.linesAdded !== null || live.linesRemoved !== null) {
    rows.push(metaRow("Edits", `+${live.linesAdded ?? 0} / −${live.linesRemoved ?? 0}`));
  }

  const collapsed = isSectionCollapsed("session");
  return `
    <section class="acct-section">
      <header class="acct-section-header" data-section="session"
        role="button" tabindex="0" aria-expanded="${!collapsed}">
        <span class="acct-section-chevron ${collapsed ? "collapsed" : ""}">${icon("chevron-down", 14)}</span>
        <h2 class="acct-section-title">Current session</h2>
      </header>
      ${collapsed ? "" : `<div class="acct-section-body"><div class="acct-meta">${rows.join("")}</div></div>`}
    </section>`;
}

// ── Section: Usage ──

function renderUsageSection(data: AccountData): string {
  const u = data.usage;
  const collapsed = isSectionCollapsed("usage");
  const period = getTimePeriod();

  if (u.daily.length === 0) {
    return `
      <section class="acct-section">
        ${renderSectionHeader("usage", "Usage", collapsed)}
        ${collapsed ? "" : `
        <div class="acct-section-body">
          <div class="acct-empty">
            <div class="acct-empty-title">No activity recorded</div>
            <div class="acct-empty-hint">Start a Claude Code session and your stats will appear here.</div>
          </div>
        </div>`}
      </section>`;
  }

  // Anchor the filter to the most recent day of recorded data. We
  // read stats-cache.json verbatim — it's what Claude CLI maintains,
  // and its `lastComputedDate` defines where "recent" ends. Anchoring
  // here keeps the filtered windows internally consistent with the
  // heatmap and day-level scalars that come from the same source.
  const latestDataDate = u.daily.length > 0
    ? u.daily[u.daily.length - 1].date
    : new Date().toISOString().slice(0, 10);
  const anchor = new Date(latestDataDate).getTime();
  const cutoffDays = cutoffDaysForPeriod(period);
  const withinPeriod = (date: string): boolean =>
    cutoffDays === Infinity ||
    (anchor - new Date(date).getTime()) / 86400000 < cutoffDays;

  const filteredActivity = u.daily.filter((d) => withinPeriod(d.date));
  const filteredTokens = u.dailyTokens.filter((d) => withinPeriod(d.date));

  // Active-days in the *selected* period, not all-time. Counts only
  // dates with user messages — sub-agent activity creates per-day
  // rows for token attribution, but a day with only agent-internal
  // work isn't a day the user "used Claude" in /stats's sense.
  const activeInPeriod = filteredActivity.filter((d) => d.messageCount > 0).length;
  const totalInPeriod = cutoffDays === Infinity ? u.totalDays : cutoffDays;

  // Period sessions: sum of per-day `sessionCount`. Matches Claude
  // CLI `/stats`, which uses the same dailyActivity rows we read.
  // A session that crosses midnight is counted on both days here —
  // the cache itself is built that way, and reconciling it would
  // require per-session timestamps the cache doesn't expose.
  const sessionsInPeriod = period === "all"
    ? u.totalSessions
    : filteredActivity.reduce((acc, d) => acc + d.sessionCount, 0);

  const totals = period === "all"
    ? {
        messages: u.totalMessages,
        sessions: sessionsInPeriod,
        tools: filteredActivity.reduce((acc, d) => acc + d.toolCallCount, 0),
      }
    : filteredActivity.reduce(
        (acc, d) => ({
          messages: acc.messages + d.messageCount,
          sessions: sessionsInPeriod, // overwritten — same value every iteration
          tools: acc.tools + d.toolCallCount,
        }),
        { messages: 0, sessions: sessionsInPeriod, tools: 0 },
      );

  const tokenTotal = period === "all"
    ? u.totalTokens
    : filteredTokens.reduce((sum, d) => sum + d.total, 0);

  return `
    <section class="acct-section">
      ${renderSectionHeader("usage", "Usage", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        <div class="vs-segmented acct-period-toggle" role="tablist">
          <button class="vs-segmented-btn ${period === "week" ? "active" : ""}" data-period="week" role="tab">7 days</button>
          <button class="vs-segmented-btn ${period === "month" ? "active" : ""}" data-period="month" role="tab">30 days</button>
          <button class="vs-segmented-btn ${period === "all" ? "active" : ""}" data-period="all" role="tab">All time</button>
        </div>

        ${renderHeatmap(u.daily, u.dailyTokens, u.lastComputedDate)}

        <div class="acct-stats-grid">
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(tokenTotal)}</div><div class="acct-stat-k">tokens</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.sessions)}</div><div class="acct-stat-k">sessions</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.messages)}</div><div class="acct-stat-k">messages</div></div>
          <div class="acct-stat" title="${esc(cacheHitTooltip(u))}"><div class="acct-stat-v">${formatPct(u.cacheHitRatio)}</div><div class="acct-stat-k">cache hit</div></div>
        </div>
        ${renderUsageFooter(u, period)}

        <div class="acct-meta">
          ${u.favoriteModel ? `<div class="acct-meta-row"><span class="acct-meta-k">Favorite model</span><span class="acct-meta-v">${esc(formatModelName(u.favoriteModel))}</span></div>` : ""}
          <div class="acct-meta-row"><span class="acct-meta-k">Active days</span><span class="acct-meta-v">${activeInPeriod} / ${totalInPeriod}</span></div>
          <div class="acct-meta-row"><span class="acct-meta-k">Current streak</span><span class="acct-meta-v">${u.currentStreak} day${u.currentStreak === 1 ? "" : "s"}</span></div>
          <div class="acct-meta-row"><span class="acct-meta-k">Longest streak</span><span class="acct-meta-v">${u.longestStreak} day${u.longestStreak === 1 ? "" : "s"}</span></div>
          ${u.longestSessionMs > 0 ? `<div class="acct-meta-row"><span class="acct-meta-k">Longest session</span><span class="acct-meta-v">${formatDuration(u.longestSessionMs)}</span></div>` : ""}
        </div>

        ${u.byModel.length > 1 ? `
        <div class="acct-perm-group" style="margin-top:var(--space-lg)">
          <div class="acct-perm-group-label">By model (all time)</div>
          ${u.byModel.map((m) => `
            <div class="acct-meta-row">
              <span class="acct-meta-k">${esc(formatModelName(m.model))}</span>
              <span class="acct-meta-v">${formatNumber(m.totalTokens)}${m.costUsd > 0 ? ` · ${esc(formatMoney(Math.round(m.costUsd * 100), "USD"))}` : ""}</span>
            </div>`).join("")}
          ${u.totalCostUsd > 0 ? `
            <div class="acct-meta-row acct-meta-row-total">
              <span class="acct-meta-k">Total est. cost</span>
              <span class="acct-meta-v">${esc(formatMoney(Math.round(u.totalCostUsd * 100), "USD"))}</span>
            </div>
            <div class="acct-meta-foot">Cost is an estimate from the static Anthropic price snapshot dated ${esc(u.pricesEffectiveDate)}.</div>
          ` : ""}
        </div>` : ""}

        ${renderProjectsGroup(u.byProject)}
        ${renderToolsGroup(u.byTool)}
        ${renderMcpGroup(u.byMcpServer)}
      </div>`}
    </section>`;
}

/**
 * Project breakdown — top 10 by tokens. Each row shows the project's
 * display path (real cwd when known, slug fallback), its token total
 * with estimated cost, and the last active date. The list is collapsed
 * when only one project exists because the headline numbers above
 * already cover that case.
 */
function renderProjectsGroup(byProject: UsageStats["byProject"]): string {
  if (byProject.length <= 1) return "";
  const top = byProject.slice(0, 10);
  const remaining = byProject.length - top.length;
  return `
    <div class="acct-perm-group acct-breakdown" style="margin-top:var(--space-lg)">
      <div class="acct-perm-group-label">By project (top ${top.length})</div>
      ${top.map((p) => `
        <div class="acct-breakdown-row" title="${esc(p.path)}">
          <span class="acct-breakdown-label">${esc(shortenProjectPath(p.path))}</span>
          <span class="acct-breakdown-meta">
            ${formatNumber(p.tokens)} tok
            ${p.costUsd > 0 ? ` · ${esc(formatMoney(Math.round(p.costUsd * 100), "USD"))}` : ""}
            · ${p.sessions} sess
          </span>
        </div>`).join("")}
      ${remaining > 0 ? `<div class="acct-meta-foot">+ ${remaining} more project${remaining === 1 ? "" : "s"}</div>` : ""}
    </div>`;
}

/**
 * Tool usage — top 12 by call count, rendered as horizontal bars
 * normalised against the most-used tool. Lets users see which tools
 * dominate their workflow at a glance.
 */
function renderToolsGroup(byTool: UsageStats["byTool"]): string {
  if (byTool.length === 0) return "";
  const top = byTool.slice(0, 12);
  const max = top[0].count;
  return `
    <div class="acct-perm-group acct-breakdown" style="margin-top:var(--space-lg)">
      <div class="acct-perm-group-label">Tools (top ${top.length})</div>
      ${top.map((t) => `
        <div class="acct-toolbar">
          <span class="acct-toolbar-label" title="${esc(t.name)}">${esc(displayToolName(t.name))}</span>
          <span class="acct-toolbar-track">
            <span class="acct-toolbar-fill" style="width:${Math.max(2, Math.round((t.count / max) * 100))}%"></span>
          </span>
          <span class="acct-toolbar-count">${formatNumber(t.count)}</span>
        </div>`).join("")}
    </div>`;
}

/**
 * MCP server breakdown — only renders when at least one MCP tool was
 * actually invoked. Users with no MCP usage see nothing here, which
 * keeps the panel clean for the common case.
 */
function renderMcpGroup(byMcpServer: UsageStats["byMcpServer"]): string {
  if (byMcpServer.length === 0) return "";
  return `
    <div class="acct-perm-group acct-breakdown" style="margin-top:var(--space-lg)">
      <div class="acct-perm-group-label">MCP servers used</div>
      ${byMcpServer.map((s) => `
        <div class="acct-breakdown-row">
          <span class="acct-breakdown-label">${esc(s.server)}</span>
          <span class="acct-breakdown-meta">${formatNumber(s.toolCount)} call${s.toolCount === 1 ? "" : "s"} · ${s.uniqueTools} tool${s.uniqueTools === 1 ? "" : "s"}</span>
        </div>`).join("")}
    </div>`;
}

/**
 * Tooltip for the cache-hit tile — explains the math so users don't
 * have to guess what "cache hit" means in the prompt-caching context.
 */
function cacheHitTooltip(u: UsageStats): string {
  if (u.totalCacheReadTokens + u.totalInputTokens === 0) {
    return "No cache activity recorded yet.";
  }
  return (
    `${formatNumber(u.totalCacheReadTokens)} tokens served from prompt cache out of ` +
    `${formatNumber(u.totalCacheReadTokens + u.totalInputTokens)} effective input tokens. ` +
    `Cache writes: ${formatNumber(u.totalCacheCreationTokens)}.`
  );
}

/** Format a ratio in [0, 1] as an integer percent. Falls back to "—". */
function formatPct(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return "—";
  return Math.round(ratio * 100) + "%";
}

/**
 * Trim a project's display path down to its trailing 2–3 segments so
 * the row stays scannable in a narrow sidebar. The full path is
 * preserved in a tooltip on the parent element. Works for both real
 * `cwd` paths (Windows `\`, POSIX `/`) and slug fallbacks (`-`-joined).
 */
function shortenProjectPath(p: string): string {
  if (!p) return "(unknown)";
  // Real path: split on either separator and keep the last 2 parts.
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(-2).join("/");
  }
  // Slug fallback like `C--Users-…-claude-manager`. Keep last 3 segments
  // joined — slugs lose true path boundaries (Claude replaces both `\`
  // and `:` with `-`), but the tail is usually the project name.
  const slugParts = p.split("-").filter(Boolean);
  if (slugParts.length >= 3) return slugParts.slice(-3).join("-");
  return p;
}

/**
 * Friendly display name for a tool. MCP tools (`mcp__server__name`)
 * collapse to `server: name`; built-in tools render verbatim.
 */
function displayToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const rest = name.slice(5);
    const sep = rest.indexOf("__");
    if (sep > 0) return `${rest.slice(0, sep)}: ${rest.slice(sep + 2)}`;
  }
  return name;
}

/**
 * Footer note under the stats grid. Currently a no-op — kept as a
 * seam so future caveats (e.g. multi-profile merge attribution) can
 * surface without re-threading a new render slot. Numbers come from
 * the live JSONL walk, so we no longer need the previous "period
 * totals approximate" disclaimer.
 */
function renderUsageFooter(
  _u: AccountData["usage"],
  _period: "all" | "week" | "month",
): string {
  return "";
}

/** Format large numbers as 1.2M / 345.2K / 1234. */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

/** Shorten model name like "claude-sonnet-4-5-20250929" → "Sonnet 4.5". */
function formatModelName(model: string): string {
  const m = model.match(/claude-(opus|sonnet|haiku)-(\d+)-?(\d*)/i);
  if (m) {
    const name = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
    return `${name} ${version}`;
  }
  return model;
}

/** Format ms duration as "11d 23h 57m" or "22h 4m". */
function formatDuration(ms: number): string {
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Render a GitHub-style activity heatmap. Date math + intensity
 * scaling live in `buildHeatmap` (heatmap.ts) so this function only
 * formats the resolved model into HTML — easier to reason about and
 * lets the builder be unit-tested directly.
 *
 * Width is period-aware: 7 days → 4 weeks, 30 days → 8 weeks, All →
 * span from first activity (capped at 52 weeks). Cells whose date is
 * past `lastComputedDate` but <= today render as "stale" with a
 * hatched fill, signalling that Claude's stats cache hasn't yet
 * aggregated those days.
 */
/**
 * Heatmap shows the same fixed window (a rolling year, GitHub-style)
 * regardless of the period selector — the period only affects the
 * numeric totals below. A stable visual anchor lets the user compare
 * weeks across filter changes without the grid jumping under them.
 */
function renderHeatmap(
  daily: DailyActivity[],
  dailyTokens: DailyTokens[],
  lastComputedDate: string,
): string {
  const today = new Date();
  // 52 weeks = 364 days. Builder Mon-aligns whatever start date we
  // pass, so the resulting grid is always 52 or 53 columns depending
  // on which weekday today is.
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 364);
  const startDate = start.toISOString().slice(0, 10);
  const model = buildHeatmap(today, daily, dailyTokens, {
    startDate,
    lastComputedDate,
  });
  const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const monthHtml = model.monthLabels
    .map(
      (m) => `<div class="acct-heat-month" style="grid-column:${m.col + 2};grid-row:1">${esc(m.label)}</div>`,
    )
    .join("");

  // Day labels — Mon/Wed/Fri on the left side. Three labels keep the
  // strip readable without crowding the column for each weekday.
  const dayHtml = [
    `<div class="acct-heat-day" style="grid-column:1;grid-row:2">${DAY_ABBR[0]}</div>`,
    `<div class="acct-heat-day" style="grid-column:1;grid-row:4">${DAY_ABBR[2]}</div>`,
    `<div class="acct-heat-day" style="grid-column:1;grid-row:6">${DAY_ABBR[4]}</div>`,
  ].join("");

  const cellsHtml = model.cells.map(renderHeatCell).join("");

  return `
    <div class="acct-heatmap-wrap">
      <div class="acct-heatmap" style="grid-template-columns:auto repeat(${model.weeks}, 16px);">
        ${monthHtml}${dayHtml}${cellsHtml}
      </div>
    </div>`;
}

/** Format one cell's HTML — class list, grid coords, tooltip. */
function renderHeatCell(cell: HeatmapCell): string {
  const classes = ["acct-heat-cell", `lvl-${cell.level}`, `state-${cell.state}`];
  const date = new Date(cell.date + "T00:00:00");
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  let tooltip: string;
  if (cell.state === "future") {
    tooltip = dateLabel;
  } else if (cell.state === "stale") {
    tooltip = `Not yet computed · ${dateLabel}`;
  } else if (cell.tokens > 0) {
    tooltip = `${formatNumber(cell.tokens)} tokens · ${cell.messages} message${cell.messages === 1 ? "" : "s"} · ${cell.sessions} session${cell.sessions === 1 ? "" : "s"} · ${dateLabel}`;
  } else if (cell.messages > 0) {
    tooltip = `${cell.messages} message${cell.messages === 1 ? "" : "s"} · ${cell.sessions} session${cell.sessions === 1 ? "" : "s"} · ${dateLabel}`;
  } else {
    tooltip = `No activity · ${dateLabel}`;
  }
  return `<div class="${classes.join(" ")}" title="${esc(tooltip)}" style="grid-column:${cell.col + 2};grid-row:${cell.row + 2}"></div>`;
}


// ── Section: Settings ──

// Settings + Permissions rendering moved to Config tab (src/features/config/webview/view.ts).
// The Account tab is identity-only now: Profile + Quota + Usage.

// ── Shared header ──

function renderSectionHeader(id: string, title: string, collapsed: boolean): string {
  return `<header class="acct-section-header" data-section="${id}" role="button" tabindex="0" aria-expanded="${!collapsed}">
    <span class="acct-section-chevron ${collapsed ? "collapsed" : ""}">${icon("chevron-down", 14)}</span>
    <h2 class="acct-section-title">${esc(title)}</h2>
  </header>`;
}

// ── Handlers ──

function bindHandlers(container: HTMLElement, data: AccountData): void {
  // Heatmap horizontal scroll: keep today (rightmost column) visible.
  // The 52-week grid is wider than a narrow sidebar, so the default
  // browser scroll-position (left) hides today on first paint and on
  // every resize that changes the grid's intrinsic width. Snap to the
  // right edge after layout, and re-snap on container resize.
  const heatWrap = container.querySelector<HTMLElement>(".acct-heatmap-wrap");
  if (heatWrap) {
    const scrollToToday = (): void => {
      heatWrap.scrollLeft = heatWrap.scrollWidth;
    };
    // Defer one frame so the browser has computed scrollWidth after
    // the freshly-injected innerHTML lays out.
    requestAnimationFrame(scrollToToday);
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(scrollToToday);
      ro.observe(heatWrap);
    }
  }

  // Section collapse
  container.querySelectorAll<HTMLElement>(".acct-section-header").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.section;
      if (id) {
        toggleSection(id);
        renderAccount(container);
      }
    });
    el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Slash command buttons
  container.querySelectorAll<HTMLElement>("[data-slash]").forEach((el) => {
    el.addEventListener("click", () => {
      const cmd = el.dataset.slash;
      if (cmd) sendLaunchSlash(cmd);
    });
  });

  // URL buttons
  container.querySelectorAll<HTMLElement>("[data-url]").forEach((el) => {
    el.addEventListener("click", () => {
      const url = el.dataset.url;
      if (url) sendOpenAccountUrl(url);
    });
  });

  // Time period toggle
  container.querySelectorAll<HTMLElement>("[data-period]").forEach((el) => {
    el.addEventListener("click", () => {
      const period = el.dataset.period as "all" | "week" | "month" | undefined;
      if (period) {
        setTimePeriod(period);
        renderAccount(container);
      }
    });
  });

  // Settings inputs
  // Brief "saved" flash animation on a field's nearest label
  const flashSaved = (inputEl: HTMLElement): void => {
    const field = inputEl.closest<HTMLElement>(".acct-field");
    if (!field) return;
    field.classList.add("acct-field-saved");
    setTimeout(() => field.classList.remove("acct-field-saved"), 1200);
  };

  const modelTrigger = container.querySelector<HTMLElement>("#acct-model");
  const modelDesc = container.querySelector<HTMLElement>("#acct-model-desc");
  const modelOpts = buildModelOptions(data, data.settings.model || "default");
  const modelDescMap = buildModelDescMap(modelOpts);
  bindSelect(container, "acct-model", (value) => {
    sendSetModel(value === "default" ? "" : value);
    if (modelDesc) modelDesc.textContent = modelDescMap[value] ?? "";
    if (modelTrigger) flashSaved(modelTrigger);
  });

  const voiceCheckbox = container.querySelector<HTMLInputElement>("#acct-voice");
  voiceCheckbox?.addEventListener("change", () => {
    sendSetVoiceEnabled(voiceCheckbox.checked);
    flashSaved(voiceCheckbox);
  });

  const commitInput = container.querySelector<HTMLInputElement>("#acct-commit");
  commitInput?.addEventListener("change", () => {
    sendSetCommitAttribution(commitInput.value);
    flashSaved(commitInput);
  });

  const prInput = container.querySelector<HTMLInputElement>("#acct-pr");
  prInput?.addEventListener("change", () => {
    sendSetPrAttribution(prInput.value);
    flashSaved(prInput);
  });

  // Config restore banner
  container.querySelector<HTMLElement>("#acct-restore-config")?.addEventListener("click", () => {
    sendRestoreClaudeConfig();
  });

  // Quota refresh. Same element id in the no-data notice + success
  // header so one handler covers every Refresh click. Flip to loading
  // optimistically so the spinner appears immediately.
  container.querySelector<HTMLElement>("#acct-quota-fetch")?.addEventListener("click", (e: Event) => {
    // Prevent the click from bubbling to the section header (the
    // button lives inside `.acct-section-header` for layout) — a
    // bubble would collapse the section on every refresh.
    e.stopPropagation();
    setQuotaStatus({ kind: "loading" });
    renderAccount(container);
    sendFetchQuota();
  });

  // Enable live quota — installs the statusline tap (opt-in). The host
  // wires settings.json then replies with quotaData (no-data until
  // Claude renders). Flip to loading so the CTA doesn't sit unresponsive.
  container.querySelector<HTMLElement>("#acct-quota-install")?.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    setQuotaStatus({ kind: "loading" });
    renderAccount(container);
    sendInstallStatusline();
  });

  // Profile section — Save profile + Switch account buttons. Save
  // routes through the host's showInputBox (via promptSaveProfile);
  // Switch opens a QuickPick with saved profiles + add/remove
  // controls. Everything UX-sensitive lives in the host so the
  // webview stays lean.
  container
    .querySelector<HTMLElement>("#acct-save-profile")
    ?.addEventListener("click", () => sendPromptSaveProfile());
  container
    .querySelector<HTMLElement>("#acct-switch-account")
    ?.addEventListener("click", () => sendOpenAccountSwitcher());
  // Avatar doubles as a switch-account affordance — standard pattern
  // (Gmail, Mac menubar, GitHub header). Keeps the action reachable
  // even when the user scrolls past the button row.
  container
    .querySelector<HTMLElement>("#acct-avatar-switch")
    ?.addEventListener("click", () => sendOpenAccountSwitcher());

  // Open settings file buttons
  container.querySelector<HTMLElement>("#acct-open-settings")?.addEventListener("click", () => {
    sendOpenSettingsFile("global");
  });
  container.querySelector<HTMLElement>("#acct-open-perms")?.addEventListener("click", () => {
    sendOpenSettingsFile(getPermissionScope());
  });

  // Permission scope toggle
  container.querySelectorAll<HTMLElement>(".acct-scope-toggle [data-scope]").forEach((el) => {
    el.addEventListener("click", () => {
      const scope = el.dataset.scope as PermissionScope | undefined;
      if (scope) {
        setPermissionScope(scope);
        renderAccount(container);
      }
    });
  });

  // Add permission — routes to extension host which opens a native VS Code
  // input box (themed, validated, better than window.prompt).
  container.querySelector<HTMLElement>("#acct-add-perm")?.addEventListener("click", () => {
    sendPromptAddPermission(getPermissionScope(), "allow");
  });

  // Remove permission
  container.querySelectorAll<HTMLElement>(".acct-perm-remove").forEach((el) => {
    el.addEventListener("click", () => {
      const tool = el.dataset.remove;
      const list = el.dataset.removeList as "allow" | "deny" | undefined;
      const scope = el.dataset.removeScope as PermissionScope | undefined;
      if (tool && list && scope) {
        sendRemovePermission(scope, tool, list);
      }
    });
  });
}
