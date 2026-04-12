/**
 * Account tab view — renders profile, usage, settings, and permissions sections.
 * All sections are collapsible via clickable headers.
 */

import { icon } from "../../../webview/icons";
import { esc } from "../../../webview/utils";
import {
  sendLaunchSlash,
  sendOpenAccountUrl,
  sendOpenSettingsFile,
  sendSetCommitAttribution,
  sendSetModel,
  sendSetPrAttribution,
  sendSetVoiceEnabled,
  sendAddPermission,
  sendRemovePermission,
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
        <div class="acct-profile">
          <div class="acct-avatar">${esc(initial)}</div>
          <div class="acct-profile-info">
            <div class="acct-name">${esc(p.displayName || "Unknown")}</div>
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

  // Filter daily buckets by time period
  const now = Date.now();
  const cutoffDays = period === "week" ? 7 : period === "month" ? 30 : Infinity;
  const withinPeriod = (date: string): boolean =>
    cutoffDays === Infinity || (now - new Date(date).getTime()) / 86400000 <= cutoffDays;

  const filteredActivity = u.daily.filter((d) => withinPeriod(d.date));
  const filteredTokens = u.dailyTokens.filter((d) => withinPeriod(d.date));

  const totals = filteredActivity.reduce(
    (acc, d) => ({
      messages: acc.messages + d.messageCount,
      sessions: acc.sessions + d.sessionCount,
      tools: acc.tools + d.toolCallCount,
    }),
    { messages: 0, sessions: 0, tools: 0 },
  );

  const tokenTotal = filteredTokens.reduce((sum, d) => sum + d.total, 0);

  return `
    <section class="acct-section">
      ${renderSectionHeader("usage", "Usage", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        <div class="acct-period-toggle" role="tablist">
          <button class="acct-period ${period === "week" ? "active" : ""}" data-period="week" role="tab">7 days</button>
          <button class="acct-period ${period === "month" ? "active" : ""}" data-period="month" role="tab">30 days</button>
          <button class="acct-period ${period === "all" ? "active" : ""}" data-period="all" role="tab">All time</button>
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

/** Render a GitHub-style activity heatmap for the last ~12 weeks. */
function renderHeatmap(daily: DailyActivity[]): string {
  // Build map for O(1) lookup
  const byDate = new Map<string, DailyActivity>();
  for (const d of daily) byDate.set(d.date, d);

  // Last 84 days (12 weeks)
  const DAYS = 84;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find max for scaling
  let max = 0;
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    if (entry && entry.messageCount > max) max = entry.messageCount;
  }

  const cells: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    const count = entry?.messageCount ?? 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    const label = entry ? `${entry.messageCount} messages on ${key}` : `No activity on ${key}`;
    cells.push(`<div class="acct-heat-cell lvl-${level}" title="${esc(label)}"></div>`);
  }

  return `<div class="acct-heatmap">${cells.join("")}</div>`;
}

// ── Section: Settings ──

function renderSettingsSection(data: AccountData): string {
  const s = data.settings;
  const collapsed = isSectionCollapsed("settings");
  const currentModel = s.model || "default";

  return `
    <section class="acct-section">
      ${renderSectionHeader("settings", "Settings", collapsed)}
      ${collapsed ? "" : `
      <div class="acct-section-body">
        <div class="acct-field">
          <label class="acct-label">Model</label>
          <select class="acct-select" id="acct-model">
            <option value="default" ${currentModel === "default" ? "selected" : ""}>Default (recommended)</option>
            <option value="sonnet" ${currentModel === "sonnet" ? "selected" : ""}>Sonnet</option>
            <option value="opus" ${currentModel === "opus" ? "selected" : ""}>Opus</option>
            <option value="haiku" ${currentModel === "haiku" ? "selected" : ""}>Haiku</option>
          </select>
        </div>

        <div class="acct-field">
          <label class="acct-label acct-label-inline">
            <input type="checkbox" id="acct-voice" ${s.voiceEnabled ? "checked" : ""}>
            <span>Voice dictation</span>
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
        <div class="acct-scope-toggle" role="tablist">
          <button class="acct-scope ${scope === "global" ? "active" : ""}" data-scope="global" role="tab">Global</button>
          ${hasProjectScope ? `<button class="acct-scope ${scope === "project" ? "active" : ""}" data-scope="project" role="tab">Project</button>` : ""}
          ${hasProjectScope ? `<button class="acct-scope ${scope === "local" ? "active" : ""}" data-scope="local" role="tab">Local</button>` : ""}
        </div>

        ${renderPermissionList(set?.allow ?? [], scope, "allow", "Allowed")}
        ${renderPermissionList(set?.deny ?? [], scope, "deny", "Denied")}

        <div class="acct-actions">
          <button class="btn" id="acct-add-perm">${icon("plus", 14)} Add tool</button>
          <button class="btn" data-scope="${scope}" id="acct-open-perms">${icon("external-link", 14)} Edit in file</button>
        </div>
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
  container.querySelectorAll<HTMLElement>(".acct-period").forEach((el) => {
    el.addEventListener("click", () => {
      const period = el.dataset.period as "all" | "week" | "month" | undefined;
      if (period) {
        setTimePeriod(period);
        renderAccount(container);
      }
    });
  });

  // Settings inputs
  const modelSelect = container.querySelector<HTMLSelectElement>("#acct-model");
  modelSelect?.addEventListener("change", () => {
    sendSetModel(modelSelect.value === "default" ? "" : modelSelect.value);
  });

  const voiceCheckbox = container.querySelector<HTMLInputElement>("#acct-voice");
  voiceCheckbox?.addEventListener("change", () => {
    sendSetVoiceEnabled(voiceCheckbox.checked);
  });

  const commitInput = container.querySelector<HTMLInputElement>("#acct-commit");
  commitInput?.addEventListener("change", () => {
    sendSetCommitAttribution(commitInput.value);
  });

  const prInput = container.querySelector<HTMLInputElement>("#acct-pr");
  prInput?.addEventListener("change", () => {
    sendSetPrAttribution(prInput.value);
  });

  // Open settings file buttons
  container.querySelector<HTMLElement>("#acct-open-settings")?.addEventListener("click", () => {
    sendOpenSettingsFile("global");
  });
  container.querySelector<HTMLElement>("#acct-open-perms")?.addEventListener("click", () => {
    sendOpenSettingsFile(getPermissionScope());
  });

  // Permission scope toggle
  container.querySelectorAll<HTMLElement>(".acct-scope").forEach((el) => {
    el.addEventListener("click", () => {
      const scope = el.dataset.scope as PermissionScope | undefined;
      if (scope) {
        setPermissionScope(scope);
        renderAccount(container);
      }
    });
  });

  // Add permission (simple prompt)
  container.querySelector<HTMLElement>("#acct-add-perm")?.addEventListener("click", () => {
    const tool = window.prompt("Enter tool name (e.g. Bash(git push:*) or Read):");
    if (tool && tool.trim()) {
      sendAddPermission(getPermissionScope(), tool.trim(), "allow");
    }
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
