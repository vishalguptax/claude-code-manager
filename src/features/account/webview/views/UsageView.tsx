/**
 * Usage section — activity heatmap, period-filtered scalars, and
 * breakdowns by model / project / tool / MCP server. All numbers come
 * from Claude CLI's stats-cache.json (read verbatim by the host), so
 * they match what `/stats` shows in the terminal.
 *
 * The breakdown lists are capped small (projects top 10, tools top 12,
 * models/MCP a handful), so they render in full — well under the
 * VirtualList threshold (>50 items) the F1 shell reserves for the
 * thousand-session lists in the Sessions feature.
 */

import { cx } from "../../../../webview/utils/classnames";
import type { AccountData, UsageStats } from "../../types";
import { isSectionCollapsed, timePeriod, toggleSection, type TimePeriod } from "../signals";
import {
  cacheHitTooltip,
  computeUsageTotals,
  displayToolName,
  formatDuration,
  formatModelName,
  formatMoney,
  formatNumber,
  formatPct,
  shortenProjectPath,
} from "../format";
import { SectionHeader } from "../components/SectionHeader";
import { StatTile } from "../components/StatTile";
import { MetaRow } from "../components/MetaRow";
import { Heatmap } from "../components/Heatmap";

export interface UsageViewProps {
  data: AccountData;
}

const PERIODS: ReadonlyArray<{ id: TimePeriod; label: string }> = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All time" },
];

export function UsageView({ data }: UsageViewProps) {
  const collapsed = isSectionCollapsed("usage");
  const u = data.usage;
  return (
    <section class="acct-section">
      <SectionHeader id="usage" title="Usage" collapsed={collapsed} onToggle={toggleSection} />
      {collapsed ? null : (
        <div class="acct-section-body">
          {u.daily.length === 0 ? <UsageEmpty /> : <UsageBody u={u} />}
        </div>
      )}
    </section>
  );
}

function UsageEmpty() {
  return (
    <div class="acct-empty">
      <div class="acct-empty-title">No activity recorded</div>
      <div class="acct-empty-hint">
        Start a Claude Code session and your stats will appear here.
      </div>
    </div>
  );
}

function UsageBody({ u }: { u: UsageStats }) {
  const period = timePeriod.value;
  const totals = computeUsageTotals(u, period);

  return (
    <>
      <div class="vs-segmented acct-period-toggle" role="tablist">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            class={cx("vs-segmented-btn", period === p.id && "active")}
            role="tab"
            aria-selected={period === p.id}
            onClick={() => {
              timePeriod.value = p.id;
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Heatmap daily={u.daily} dailyTokens={u.dailyTokens} lastComputedDate={u.lastComputedDate} />

      <div class="acct-stats-grid">
        <StatTile value={formatNumber(totals.tokenTotal)} label="tokens" />
        <StatTile value={formatNumber(totals.sessions)} label="sessions" />
        <StatTile value={formatNumber(totals.messages)} label="messages" />
        <StatTile value={formatPct(u.cacheHitRatio)} label="cache hit" title={cacheHitTooltip(u)} />
      </div>

      <div class="acct-meta">
        {u.favoriteModel ? (
          <MetaRow k="Favorite model" v={formatModelName(u.favoriteModel)} />
        ) : null}
        <MetaRow k="Active days" v={`${totals.activeInPeriod} / ${totals.totalInPeriod}`} />
        <MetaRow k="Current streak" v={`${u.currentStreak} day${u.currentStreak === 1 ? "" : "s"}`} />
        <MetaRow k="Longest streak" v={`${u.longestStreak} day${u.longestStreak === 1 ? "" : "s"}`} />
        {u.longestSessionMs > 0 ? (
          <MetaRow k="Longest session" v={formatDuration(u.longestSessionMs)} />
        ) : null}
      </div>

      <ByModelGroup u={u} />
      <ProjectsGroup byProject={u.byProject} />
      <ToolsGroup byTool={u.byTool} />
      <McpGroup byMcpServer={u.byMcpServer} />
    </>
  );
}

function ByModelGroup({ u }: { u: UsageStats }) {
  if (u.byModel.length <= 1) return null;
  return (
    <div class="acct-perm-group acct-group-spaced">
      <div class="acct-perm-group-label">By model (all time)</div>
      {u.byModel.map((m) => (
        <MetaRow
          key={m.model}
          k={formatModelName(m.model)}
          v={`${formatNumber(m.totalTokens)}${
            m.costUsd > 0 ? ` · ${formatMoney(Math.round(m.costUsd * 100), "USD")}` : ""
          }`}
        />
      ))}
      {u.totalCostUsd > 0 ? (
        <>
          <MetaRow k="Total est. cost" v={formatMoney(Math.round(u.totalCostUsd * 100), "USD")} total />
          <div class="acct-meta-foot">
            Cost is an estimate from the static Anthropic price snapshot dated{" "}
            {u.pricesEffectiveDate}.
          </div>
        </>
      ) : null}
    </div>
  );
}

function ProjectsGroup({ byProject }: { byProject: UsageStats["byProject"] }) {
  if (byProject.length <= 1) return null;
  const top = byProject.slice(0, 10);
  const remaining = byProject.length - top.length;
  return (
    <div class="acct-perm-group acct-breakdown acct-group-spaced">
      <div class="acct-perm-group-label">By project (top {top.length})</div>
      {top.map((p) => (
        <div class="acct-breakdown-row" title={p.path} key={p.slug}>
          <span class="acct-breakdown-label">{shortenProjectPath(p.path)}</span>
          <span class="acct-breakdown-meta">
            {formatNumber(p.tokens)} tok
            {p.costUsd > 0 ? ` · ${formatMoney(Math.round(p.costUsd * 100), "USD")}` : ""} ·{" "}
            {p.sessions} sess
          </span>
        </div>
      ))}
      {remaining > 0 ? (
        <div class="acct-meta-foot">
          + {remaining} more project{remaining === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

function ToolsGroup({ byTool }: { byTool: UsageStats["byTool"] }) {
  if (byTool.length === 0) return null;
  const top = byTool.slice(0, 12);
  const max = top[0].count;
  return (
    <div class="acct-perm-group acct-breakdown acct-group-spaced">
      <div class="acct-perm-group-label">Tools (top {top.length})</div>
      {top.map((t) => (
        <div class="acct-toolbar" key={t.name}>
          <span class="acct-toolbar-label" title={t.name}>
            {displayToolName(t.name)}
          </span>
          <span class="acct-toolbar-track">
            <span
              class="acct-toolbar-fill"
              style={{ width: `${Math.max(2, Math.round((t.count / max) * 100))}%` }}
            />
          </span>
          <span class="acct-toolbar-count">{formatNumber(t.count)}</span>
        </div>
      ))}
    </div>
  );
}

function McpGroup({ byMcpServer }: { byMcpServer: UsageStats["byMcpServer"] }) {
  if (byMcpServer.length === 0) return null;
  return (
    <div class="acct-perm-group acct-breakdown acct-group-spaced">
      <div class="acct-perm-group-label">MCP servers used</div>
      {byMcpServer.map((s) => (
        <div class="acct-breakdown-row" key={s.server}>
          <span class="acct-breakdown-label">{s.server}</span>
          <span class="acct-breakdown-meta">
            {formatNumber(s.toolCount)} call{s.toolCount === 1 ? "" : "s"} · {s.uniqueTools} tool
            {s.uniqueTools === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}
