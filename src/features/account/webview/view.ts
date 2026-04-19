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
} from "./api";
import {
  getAccountData,
  getPermissionScope,
  getTimePeriod,
  isLoading,
  isSectionCollapsed,
  setPermissionScope,
  setTimePeriod,
  toggleSection,
} from "./state";
import type { AccountData, DailyActivity, PermissionScope } from "../types";

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
      ${renderUsageSection(data)}
      ${renderSettingsSection(data)}
      ${renderPermissionsSection(data)}
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
    return `
      <section class="acct-section">
        ${renderSectionHeader("profile", "Profile", collapsed)}
        ${collapsed ? "" : `
        <div class="acct-section-body">
          <div class="acct-empty">
            <div class="acct-empty-title">Not signed in</div>
            <div class="acct-empty-hint">Sign in to Claude Code to view your account.</div>
            <button class="btn green" data-slash="/login">${icon("play", 14)} Log in</button>
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
          <div class="acct-avatar">${esc(initial)}</div>
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
          <button class="btn" data-slash="/login">${icon("refresh-cw", 14)} Switch account</button>
          <button class="btn del" data-slash="/logout">${icon("x", 14)} Log out</button>
          <button class="btn" data-url="https://claude.ai/settings">${icon("external-link", 14)} Open claude.ai</button>
        </div>
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

  // Anchor the filter to the most recent day of recorded data, not
  // wall-clock today. Claude CLI rebuilds stats-cache.json only
  // periodically (it's 8+ days stale on some machines), so "last 7
  // days from today" would show 0. "Last 7 days of recorded data"
  // gives users the real usage picture regardless of cache freshness.
  const latestDataDate = u.daily.length > 0
    ? u.daily[u.daily.length - 1].date
    : new Date().toISOString().slice(0, 10);
  const anchor = new Date(latestDataDate).getTime();
  const cutoffDays = period === "week" ? 7 : period === "month" ? 30 : Infinity;
  const withinPeriod = (date: string): boolean =>
    cutoffDays === Infinity ||
    (anchor - new Date(date).getTime()) / 86400000 <= cutoffDays;

  const filteredActivity = u.daily.filter((d) => withinPeriod(d.date));
  const filteredTokens = u.dailyTokens.filter((d) => withinPeriod(d.date));

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

        ${renderHeatmap(u.daily)}

        <div class="acct-stats-grid">
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(tokenTotal)}</div><div class="acct-stat-k">tokens</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.sessions)}</div><div class="acct-stat-k">sessions</div></div>
          <div class="acct-stat"><div class="acct-stat-v">${formatNumber(totals.messages)}</div><div class="acct-stat-k">messages</div></div>
        </div>

        <div class="acct-meta">
          ${u.favoriteModel ? `<div class="acct-meta-row"><span class="acct-meta-k">Favorite model</span><span class="acct-meta-v">${esc(formatModelName(u.favoriteModel))}</span></div>` : ""}
          <div class="acct-meta-row"><span class="acct-meta-k">Active days</span><span class="acct-meta-v">${u.activeDays} / ${u.totalDays}</span></div>
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
function renderHeatmap(daily: DailyActivity[]): string {
  const byDate = new Map<string, DailyActivity>();
  for (const d of daily) byDate.set(d.date, d);

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

  // Find max for scaling (only count actual daily entries)
  let max = 0;
  for (const entry of byDate.values()) {
    if (entry.messageCount > max) max = entry.messageCount;
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
      const count = entry?.messageCount ?? 0;
      const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
      const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const tooltip = entry
        ? `${entry.messageCount} messages · ${entry.sessionCount} session${entry.sessionCount === 1 ? "" : "s"} · ${dateLabel}`
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

function renderSettingsSection(data: AccountData): string {
  const s = data.settings;
  const collapsed = isSectionCollapsed("settings");
  const currentModel = s.model || "default";
  const modelOptions = buildModelOptions(data, currentModel);
  const currentOption = modelOptions.find((o) => o.value === currentModel);

  return `
    <section class="acct-section">
      ${renderSectionHeader("settings", "Settings", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        <div class="acct-field">
          <label class="acct-label" for="acct-model">Model</label>
          ${renderSelect("acct-model", modelOptions, currentModel)}
          <div class="acct-field-hint" id="acct-model-desc">${esc(currentOption?.desc ?? "")}</div>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input type="checkbox" id="acct-voice" ${s.voiceEnabled ? "checked" : ""}>
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb"></span></span>
            <span class="acct-toggle-text">Voice dictation</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-label">Commit attribution</label>
          <input type="text" class="acct-input" id="acct-commit" value="${esc(s.commitAttribution)}" placeholder="e.g., Co-authored-by: Claude">
        </div>

        <div class="acct-field">
          <label class="acct-label">PR attribution</label>
          <input type="text" class="acct-input" id="acct-pr" value="${esc(s.prAttribution)}" placeholder="e.g., Generated with Claude Code">
        </div>

        ${s.statusLineCommand ? `
        <div class="acct-field">
          <label class="acct-label">Status line command</label>
          <code class="acct-code">${esc(s.statusLineCommand)}</code>
        </div>` : ""}

        <div class="acct-actions">
          <button class="btn" data-scope="global" id="acct-open-settings">${icon("external-link", 14)} Open settings.json</button>
          <button class="btn" data-slash="/config">${icon("terminal", 14)} Open /config</button>
        </div>

        <div class="acct-footnote">Changes apply to new Claude sessions.</div>
      </div>`}
    </section>`;
}

// ── Section: Permissions ──

function renderPermissionsSection(data: AccountData): string {
  const collapsed = isSectionCollapsed("permissions");
  const scope = getPermissionScope();
  const set = data.permissions.find((p) => p.scope === scope);
  const hasProjectScope = data.permissions.some((p) => p.scope === "project");

  return `
    <section class="acct-section">
      ${renderSectionHeader("permissions", "Permissions", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        <div class="vs-segmented acct-scope-toggle" role="tablist">
          <button class="vs-segmented-btn ${scope === "global" ? "active" : ""}" data-scope="global" role="tab">Global</button>
          ${hasProjectScope ? `<button class="vs-segmented-btn ${scope === "project" ? "active" : ""}" data-scope="project" role="tab">Project</button>` : ""}
          ${hasProjectScope ? `<button class="vs-segmented-btn ${scope === "local" ? "active" : ""}" data-scope="local" role="tab">Local</button>` : ""}
        </div>

        ${renderPermissionList(set?.allow ?? [], scope, "allow", "Allowed")}
        ${renderPermissionList(set?.deny ?? [], scope, "deny", "Denied")}

        <div class="acct-actions">
          <button class="btn" id="acct-add-perm">${icon("plus", 14)} Add tool</button>
          <button class="btn" data-scope="${scope}" id="acct-open-perms">${icon("external-link", 14)} Edit in file</button>
        </div>

        <div class="acct-footnote">Changes apply to new Claude sessions.</div>
      </div>`}
    </section>`;
}

function renderPermissionList(
  items: string[],
  scope: PermissionScope,
  list: "allow" | "deny",
  label: string,
): string {
  if (items.length === 0) {
    return `
      <div class="acct-perm-group">
        <div class="acct-perm-group-label">${esc(label)}</div>
        <div class="acct-empty-small">No ${list === "allow" ? "allowed" : "denied"} tools</div>
      </div>`;
  }

  const rows = items
    .map(
      (t) =>
        `<div class="acct-perm-row"><span class="acct-perm-name">${esc(t)}</span><button class="acct-perm-remove" data-remove="${esc(t)}" data-remove-list="${list}" data-remove-scope="${scope}" title="Remove">${icon("x", 12)}</button></div>`,
    )
    .join("");

  return `
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">${esc(label)} (${items.length})</div>
      ${rows}
    </div>`;
}

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
