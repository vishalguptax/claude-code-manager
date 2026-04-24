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
  setQuotaOptIn,
  setTimePeriod,
  toggleSection,
} from "./state";
import type {
  AccountData,
  DailyActivity,
  DailyTokens,
  PermissionScope,
} from "../types";
import type { QuotaData, QuotaWindow, QuotaError } from "../quota";

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
  const memberSince = p.accountCreatedAt
    ? new Date(p.accountCreatedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : "";
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

        <div class="acct-meta">
          ${p.organizationName ? `<div class="acct-meta-row"><span class="acct-meta-k">Organization</span><span class="acct-meta-v">${esc(p.organizationName)}${p.organizationRole ? ` &middot; <em>${esc(p.organizationRole)}</em>` : ""}</span></div>` : ""}
          ${memberSince ? `<div class="acct-meta-row"><span class="acct-meta-k">Member since</span><span class="acct-meta-v">${esc(memberSince)}</span></div>` : ""}
          ${p.startupCount > 0 ? `<div class="acct-meta-row"><span class="acct-meta-k">Launches</span><span class="acct-meta-v">${p.startupCount.toLocaleString()}</span></div>` : ""}
          ${expiresInDays > 0 ? `<div class="acct-meta-row"><span class="acct-meta-k">Session expires</span><span class="acct-meta-v">in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}</span></div>` : ""}
        </div>

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
function formatResetsIn(isoResetsAt: string): string {
  if (!isoResetsAt) return "";
  const resetMs = Date.parse(isoResetsAt);
  if (Number.isNaN(resetMs)) return "";
  const diffMs = resetMs - Date.now();
  if (diffMs <= 0) return "resets now";
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

  if (status.kind === "idle") {
    return `
      <div class="acct-quota-intro">
        <p class="acct-quota-intro-text">
          See how much of your Claude subscription you've used in the last
          five hours and the last seven days. Uses your own OAuth token —
          the request goes to <code>api.anthropic.com</code> and nothing
          else leaves your machine.
        </p>
        <button class="btn primary" id="acct-quota-fetch">
          ${icon("refresh-cw", 14)} Check quota
        </button>
      </div>`;
  }

  if (status.kind === "loading") {
    return `
      <div class="acct-quota-loading" aria-live="polite">
        <span class="acct-quota-spinner" aria-hidden="true"></span>
        <span>Checking your quota…</span>
      </div>`;
  }

  if (status.kind === "error") {
    return renderQuotaError(status.error);
  }

  return renderQuotaSuccess(status.data);
}

/** Render the populated quota card — bars + optional extras + footer. */
function renderQuotaSuccess(data: QuotaData): string {
  const rows: string[] = [];
  rows.push(renderQuotaBar("5-hour window", data.fiveHour));
  rows.push(renderQuotaBar("7-day window", data.sevenDay));
  if (data.sevenDayOpus) {
    rows.push(renderQuotaBar("7-day Opus", data.sevenDayOpus));
  }
  if (data.sevenDaySonnet) {
    rows.push(renderQuotaBar("7-day Sonnet", data.sevenDaySonnet));
  }

  // Pay-as-you-go overflow, if the user has it enabled. Formats
  // monthly_limit/used_credits as currency when present.
  //
  // The OAuth /usage endpoint returns these fields in the currency's
  // MINOR unit (cents for USD/AUD/EUR, fils for BHD, etc.) — same
  // convention Stripe uses. Rendering the raw integer gave users
  // "23346.00 AUD" for a $233.46 spend. We convert to the major unit
  // using the ISO 4217 fraction-digit count for the currency, then
  // format via Intl.NumberFormat so locale + symbol are handled for
  // every region, not just USD.
  let extraBlock = "";
  if (data.extraUsage?.enabled) {
    const used = data.extraUsage.usedCredits ?? 0;
    const limit = data.extraUsage.monthlyLimit ?? 0;
    const currency = data.extraUsage.currency ?? "USD";
    const pct =
      typeof data.extraUsage.utilization === "number"
        ? Math.round(data.extraUsage.utilization)
        : null;
    extraBlock = `
      <div class="acct-quota-row acct-quota-extra">
        <div class="acct-quota-row-head">
          <span class="acct-quota-label">Extra usage (monthly)</span>
          <span class="acct-quota-pct">${esc(formatMoney(used, currency))} / ${esc(formatMoney(limit, currency))}</span>
        </div>
        ${pct !== null ? `
        <div class="acct-quota-bar" role="progressbar"
          aria-label="Extra usage utilization"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="acct-quota-bar-fill tone-${quotaTone(pct)}" style="width: ${pct}%;"></div>
        </div>` : ""}
      </div>`;
  }

  // Timestamp moved into the section header (next to Refresh) in
  // renderQuotaSection — no footer here anymore. Keeps the card
  // visually bottom-flush with other sections (Profile, Usage) and
  // drops the extra horizontal divider.
  return `
    <div class="acct-quota-bars">
      ${rows.join("")}
      ${extraBlock}
    </div>`;
}

/**
 * Render an error state that's specific enough for the user to act
 * on. The error kind drives the icon; the `message` is human-crafted
 * in quota.ts so we can surface it verbatim.
 */
function renderQuotaError(err: QuotaError): string {
  const iconName =
    err.kind === "no-credentials" || err.kind === "unauthorized"
      ? "log-in"
      : err.kind === "network"
      ? "wifi-off"
      : "circle-alert";
  return `
    <div class="acct-quota-error" role="alert">
      <span class="acct-quota-error-icon">${icon(iconName, 16)}</span>
      <div class="acct-quota-error-body">
        <div class="acct-quota-error-title">Couldn't fetch quota</div>
        <div class="acct-quota-error-msg">${esc(err.message)}</div>
      </div>
      <button class="btn" id="acct-quota-fetch">
        ${icon("refresh-cw", 12)} Try again
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
  // "Fetched Xm ago" stamp lives in the header, immediately before
  // the Refresh button — so freshness + action sit together at the
  // top of the card, no bottom footer needed.
  const timestamp =
    status.kind === "success"
      ? `<span class="acct-quota-timestamp" title="${esc(status.data.fetchedAt)}">${esc(formatFetchedRelative(status.data.fetchedAt))}</span>`
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
  const cutoffDays = period === "week" ? 7 : period === "month" ? 30 : Infinity;
  const withinPeriod = (date: string): boolean =>
    cutoffDays === Infinity ||
    (anchor - new Date(date).getTime()) / 86400000 < cutoffDays;

  const filteredActivity = u.daily.filter((d) => withinPeriod(d.date));
  const filteredTokens = u.dailyTokens.filter((d) => withinPeriod(d.date));

  // Active-days in the *selected* period, not all-time. Without this
  // scoping the label shows "94 / 110" for a 30-day view because the
  // raw `activeDays`/`totalDays` are computed once across every
  // recorded day, regardless of filter. Matches the terminal /stats
  // display (e.g. "28 / 30").
  const activeInPeriod = filteredActivity.length;
  const totalInPeriod =
    period === "week" ? 7 : period === "month" ? 30 : u.totalDays;

  // For "All time" use the cache's totals directly — they're the
  // authoritative numbers Claude's /stats reports. For 7d/30d we sum
  // daily rows (which aggregate the same way Claude's filtered views do).
  const totals = period === "all"
    ? {
        messages: u.totalMessages,
        sessions: u.totalSessions,
        tools: filteredActivity.reduce((acc, d) => acc + d.toolCallCount, 0),
      }
    : filteredActivity.reduce(
        (acc, d) => ({
          messages: acc.messages + d.messageCount,
          sessions: acc.sessions + d.sessionCount,
          tools: acc.tools + d.toolCallCount,
        }),
        { messages: 0, sessions: 0, tools: 0 },
      );

  const tokenTotal = period === "all"
    ? u.totalInputTokens + u.totalOutputTokens
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

        ${renderHeatmap(u.daily, u.dailyTokens)}

        <div class="acct-stats-grid">
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(tokenTotal)}</div><div class="acct-stat-k">tokens</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.sessions)}</div><div class="acct-stat-k">sessions</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.messages)}</div><div class="acct-stat-k">messages</div></div>
        </div>
        ${u.lastComputedDate ? `<div class="acct-stats-note" title="Claude CLI maintains these numbers in ~/.claude/stats-cache.json and refreshes them on its own cadence. Terminal /stats may use a different formula for the same period, so small drift is expected.">Cache last refreshed ${esc(u.lastComputedDate)}</div>` : ""}

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
              <span class="acct-meta-v">${formatNumber(m.totalTokens)}</span>
            </div>`).join("")}
        </div>` : ""}
      </div>`}
    </section>`;
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
 * Render a GitHub-style activity heatmap for the last ~12 weeks with
 * day-of-week labels on the left and month labels across the top.
 *
 * Layout (12 weeks × 7 days):
 *
 *         Mon Feb Mar Apr
 *   Mon   ░▒▓░ ... 12 columns
 *   ...
 *   Sun   ░▒▓░
 */
function renderHeatmap(daily: DailyActivity[], dailyTokens: DailyTokens[]): string {
  const byDate = new Map<string, DailyActivity>();
  for (const d of daily) byDate.set(d.date, d);
  // Parallel index by date so tooltips can quote per-day token spend
  // alongside messages + sessions. dailyTokens is authored by the
  // same Claude CLI stats cache that populates daily, so missing
  // days simply mean "no tokens recorded that day" (common on
  // sessions that predate usage tracking).
  const tokensByDate = new Map<string, number>();
  for (const d of dailyTokens) tokensByDate.set(d.date, d.total);

  const WEEKS = 12;
  const DAYS = WEEKS * 7;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Align the start date to a Monday so columns == whole weeks
  // Oldest day = today - (DAYS - 1). Walk back further if needed to land on Monday.
  const start = new Date(today);
  start.setDate(start.getDate() - (DAYS - 1));
  const dayOfWeek = (start.getDay() + 6) % 7; // Mon=0, Sun=6
  start.setDate(start.getDate() - dayOfWeek);

  // Find max for scaling. Tokens are the primary signal — they
  // measure actual work done, whereas messageCount conflates a
  // one-word ping with a 50k-context turn. Fall back to messageCount
  // only when no token data was recorded (older sessions that
  // predate usage tracking).
  let max = 0;
  let useTokens = false;
  for (const total of tokensByDate.values()) {
    if (total > 0) {
      useTokens = true;
      if (total > max) max = total;
    }
  }
  if (!useTokens) {
    for (const entry of byDate.values()) {
      if (entry.messageCount > max) max = entry.messageCount;
    }
  }

  const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MS_PER_DAY = 86400000;

  // Build month labels — show the month name above the first column where it appears
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = new Date(start.getTime() + w * 7 * MS_PER_DAY);
    const m = weekStart.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col: w, label: MONTH_ABBR[m] });
      lastMonth = m;
    }
  }

  // Build cells (column-major order: week by week, day by day within week)
  const cellsHtml: string[] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < WEEKS; col++) {
      const d = new Date(start.getTime() + (col * 7 + row) * MS_PER_DAY);
      if (d > today) {
        cellsHtml.push(`<div class="acct-heat-cell empty"></div>`);
        continue;
      }
      const key = d.toISOString().slice(0, 10);
      const entry = byDate.get(key);
      const tokenTotal = tokensByDate.get(key) ?? 0;
      // Intensity scales on tokens when the cache has them; otherwise
      // falls back to message count so older data still paints the
      // heatmap at all. max is computed from whichever signal drives
      // the palette, so the `/max` ratio is dimensionally correct.
      const intensitySource = useTokens ? tokenTotal : (entry?.messageCount ?? 0);
      const level =
        max === 0 || intensitySource === 0
          ? 0
          : Math.min(4, Math.ceil((intensitySource / max) * 4));
      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const tooltip = entry
        ? (tokenTotal > 0
            ? `${formatNumber(tokenTotal)} tokens · ${entry.messageCount} message${entry.messageCount === 1 ? "" : "s"} · ${entry.sessionCount} session${entry.sessionCount === 1 ? "" : "s"} · ${dateLabel}`
            : `${entry.messageCount} message${entry.messageCount === 1 ? "" : "s"} · ${entry.sessionCount} session${entry.sessionCount === 1 ? "" : "s"} · ${dateLabel}`)
        : `No activity · ${dateLabel}`;
      cellsHtml.push(
        `<div class="acct-heat-cell lvl-${level}" title="${esc(tooltip)}" style="grid-column:${col + 2};grid-row:${row + 2}"></div>`,
      );
    }
  }

  // Month labels (only the ones with assigned columns)
  const monthHtml = monthLabels
    .map(
      (m) => `<div class="acct-heat-month" style="grid-column:${m.col + 2};grid-row:1">${esc(m.label)}</div>`,
    )
    .join("");

  // Day labels — show Mon/Wed/Fri on the left side
  const dayHtml = [
    `<div class="acct-heat-day" style="grid-column:1;grid-row:2">${DAY_ABBR[0]}</div>`,
    `<div class="acct-heat-day" style="grid-column:1;grid-row:4">${DAY_ABBR[2]}</div>`,
    `<div class="acct-heat-day" style="grid-column:1;grid-row:6">${DAY_ABBR[4]}</div>`,
  ].join("");

  return `<div class="acct-heatmap" style="grid-template-columns:auto repeat(${WEEKS}, 1fr);">${monthHtml}${dayHtml}${cellsHtml.join("")}</div>`;
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

  // Quota fetch / retry. Same element id across idle / error / success
  // states so one handler covers every Refresh/Try-again click. We
  // flip to the loading status optimistically so the UI reacts
  // immediately and the spinner appears without waiting for the
  // network round-trip.
  container.querySelector<HTMLElement>("#acct-quota-fetch")?.addEventListener("click", (e: Event) => {
    // Prevent the click from bubbling to the section header (the
    // button lives inside `.acct-section-header` for layout) — a
    // bubble would collapse the section on every refresh.
    e.stopPropagation();
    // Flip opt-in on first user-initiated fetch so subsequent tab
    // opens auto-refresh (up to the TTL) without re-asking.
    setQuotaOptIn(true);
    setQuotaStatus({ kind: "loading" });
    renderAccount(container);
    sendFetchQuota();
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
