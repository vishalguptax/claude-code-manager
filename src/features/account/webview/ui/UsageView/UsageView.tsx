/**
 * Usage section — activity heatmap, period-filtered scalars, and four
 * breakdowns by model / project / tool / MCP server. All numbers come
 * from Claude CLI's stats-cache.json (read verbatim by the host), so
 * they match what `/stats` shows in the terminal.
 *
 * Layout intent: previously six similarly-styled stacks below the
 * heatmap were hard to scan. Now grouped into four labelled
 * sub-sections (Cost & models · Projects · Tools · MCP) separated by
 * dividers, with a single info ribbon collapsing the per-user metadata
 * that used to occupy five MetaRow lines. Each breakdown picks the viz
 * that suits its data — donut for share-of-whole (models), ranked
 * horizontal bars for magnitude rankings (projects, tools), compact
 * pill rows for dual-count items (MCP). Cost is surfaced once at the
 * top of the models block as a headline, not sprinkled per row.
 *
 * The donut + bar viz are hand-rolled SVG / CSS so no chart dependency
 * ships to users — the CLAUDE.md "name the cost before adopting" rule.
 *
 * Lists progressively disclose: top 5 projects render by default with
 * an inline "show all N" toggle, so the first render stays compact.
 */

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { Segmented, type SegmentedOption } from "../../../../../webview/shared/ui";
import type { AccountData, McpServerUsage, ModelStats, ProjectStats, UsageStats } from "../../../types";
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
} from "../../lib";
import { isSectionCollapsed, timePeriod, toggleSection, type TimePeriod } from "../../model";
import { Donut } from "../Donut";
import { Heatmap } from "../Heatmap";
import { SectionHeader } from "../SectionHeader";
import { StatTile } from "../StatTile";

export interface UsageViewProps {
  data: AccountData;
}

const PERIODS: SegmentedOption<TimePeriod>[] = [
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
  { value: "all", label: "All time" },
];

/** How many rows to show per breakdown before "show all" expands the list. */
const PROJECT_TOP_DEFAULT = 5;
const TOOL_TOP_DEFAULT = 8;

/**
 * Stable, semantic colour per Claude family. Hand-picked so opus reads
 * as "deep" (premium), sonnet as "warm" (balanced), haiku as "fresh"
 * (fast). HSL values chosen for ≥3:1 contrast against the panel
 * background in both light + dark themes.
 */
function modelFamilyColor(model: string): string {
  if (/opus/i.test(model)) return "hsl(220, 75%, 62%)";
  if (/sonnet/i.test(model)) return "hsl(32, 85%, 60%)";
  if (/haiku/i.test(model)) return "hsl(155, 60%, 52%)";
  return "hsl(220, 8%, 55%)";
}

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
      <Segmented
        class="acct-period-toggle"
        ariaLabel="Usage period"
        value={period}
        options={PERIODS}
        onChange={(next) => {
          timePeriod.value = next;
        }}
      />

      <Heatmap daily={u.daily} dailyTokens={u.dailyTokens} lastComputedDate={u.lastComputedDate} />

      <div class="acct-stats-grid">
        <StatTile value={formatNumber(totals.tokenTotal)} label="tokens" />
        <StatTile value={formatNumber(totals.sessions)} label="sessions" />
        <StatTile value={formatNumber(totals.messages)} label="messages" />
        <StatTile value={formatPct(u.cacheHitRatio)} label="cache hit" title={cacheHitTooltip(u)} />
      </div>

      <InfoRibbon u={u} totals={totals} />

      {u.byModel.length > 0 ? (
        <>
          <SectionDivider />
          <ModelsBlock u={u} />
        </>
      ) : null}

      {u.byProject.length > 1 ? (
        <>
          <SectionDivider />
          <ProjectsBlock byProject={u.byProject} />
        </>
      ) : null}

      {u.byTool.length > 0 ? (
        <>
          <SectionDivider />
          <ToolsBlock byTool={u.byTool} />
        </>
      ) : null}

      {u.byMcpServer.length > 0 ? (
        <>
          <SectionDivider />
          <McpBlock byMcpServer={u.byMcpServer} />
        </>
      ) : null}
    </>
  );
}

function SectionDivider() {
  return <div class="acct-divider" role="separator" />;
}

/**
 * Collapses the five MetaRow lines (favorite model + active days +
 * current/longest streak + longest session) into a single ribbon under
 * the stat tiles. Easier to scan; less vertical real-estate.
 */
function InfoRibbon({
  u,
  totals,
}: {
  u: UsageStats;
  totals: ReturnType<typeof computeUsageTotals>;
}) {
  const items: string[] = [];
  if (u.favoriteModel) items.push(`Favorite: ${formatModelName(u.favoriteModel)}`);
  items.push(`${totals.activeInPeriod}/${totals.totalInPeriod} active`);
  items.push(`streak ${u.currentStreak}d`);
  if (u.longestStreak > u.currentStreak) items.push(`best ${u.longestStreak}d`);
  if (u.longestSessionMs > 0) items.push(`longest ${formatDuration(u.longestSessionMs)}`);
  return (
    <div class="acct-info-ribbon">
      {items.map((it, i) => (
        <span class="acct-ribbon-item" key={i}>
          {it}
        </span>
      ))}
    </div>
  );
}

function BlockHeading({ children }: { children: ComponentChildren }) {
  return <div class="acct-section-subhead">{children}</div>;
}

/**
 * Models = share-of-cost story. Headline total + donut + legend rows.
 * Each legend row carries its colour swatch, model name, token share %,
 * and cost — replacing the per-row inline `· $X` noise from the old
 * layout with a tabular column you can scan.
 */
function ModelsBlock({ u }: { u: UsageStats }) {
  const total = u.byModel.reduce((s, m) => s + m.totalTokens, 0);
  const segments = u.byModel.map((m) => ({
    key: m.model,
    value: m.totalTokens,
    color: modelFamilyColor(m.model),
  }));
  return (
    <div class="acct-block">
      <BlockHeading>Cost &amp; models</BlockHeading>
      {u.totalCostUsd > 0 ? (
        <div class="acct-cost-headline">
          <span class="acct-cost-label">Total est. cost</span>
          <span class="acct-cost-amount">
            {formatMoney(Math.round(u.totalCostUsd * 100), "USD")}
          </span>
        </div>
      ) : null}
      <div class="acct-models-layout">
        <Donut segments={segments} />
        <div class="acct-model-legend">
          {u.byModel.map((m) => (
            <ModelLegendRow key={m.model} m={m} total={total} />
          ))}
        </div>
      </div>
      {u.totalCostUsd > 0 ? (
        <div class="acct-meta-foot">Prices @ {u.pricesEffectiveDate}</div>
      ) : null}
    </div>
  );
}

function ModelLegendRow({ m, total }: { m: ModelStats; total: number }) {
  const sharePct = total > 0 ? Math.round((m.totalTokens / total) * 100) : 0;
  return (
    <div class="acct-model-row">
      <span class="acct-model-dot" style={{ background: modelFamilyColor(m.model) }} />
      <span class="acct-model-name" title={m.model}>
        {formatModelName(m.model)}
      </span>
      <span class="acct-model-share">{sharePct}%</span>
      <span class="acct-model-cost">
        {m.costUsd > 0 ? formatMoney(Math.round(m.costUsd * 100), "USD") : "—"}
      </span>
    </div>
  );
}

/**
 * Ranked horizontal bars for projects + tools. Bar = share of the
 * leader's value so the visual stays meaningful regardless of dataset
 * size. Tiny shares clamp to a 2% minimum width so the row never goes
 * "blank".
 */
function ProjectsBlock({ byProject }: { byProject: ProjectStats[] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = byProject;
  const total = sorted.reduce((s, p) => s + p.tokens, 0);
  const list = showAll ? sorted : sorted.slice(0, PROJECT_TOP_DEFAULT);
  const hidden = sorted.length - list.length;
  return (
    <div class="acct-block">
      <BlockHeading>Projects</BlockHeading>
      {list.map((p) => {
        const share = total > 0 ? p.tokens / total : 0;
        const pct = Math.max(2, Math.round(share * 100));
        return (
          <div class="acct-toolbar" key={p.slug} title={p.path}>
            <span class="acct-toolbar-label">{shortenProjectPath(p.path)}</span>
            <span class="acct-toolbar-track">
              <span class="acct-toolbar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span class="acct-toolbar-count">{formatNumber(p.tokens)}</span>
            <span class="acct-toolbar-sub">
              {p.sessions} sess{p.sessions === 1 ? "" : ""}
            </span>
          </div>
        );
      })}
      {hidden > 0 ? (
        <button
          type="button"
          class="acct-show-more"
          onClick={() => setShowAll(true)}
        >
          Show {hidden} more
        </button>
      ) : null}
      {showAll && sorted.length > PROJECT_TOP_DEFAULT ? (
        <button type="button" class="acct-show-more" onClick={() => setShowAll(false)}>
          Show less
        </button>
      ) : null}
    </div>
  );
}

function ToolsBlock({ byTool }: { byTool: UsageStats["byTool"] }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = byTool;
  const max = sorted[0].count;
  const list = showAll ? sorted : sorted.slice(0, TOOL_TOP_DEFAULT);
  const hidden = sorted.length - list.length;
  return (
    <div class="acct-block">
      <BlockHeading>Tools</BlockHeading>
      {list.map((t) => {
        const pct = Math.max(2, Math.round((t.count / max) * 100));
        return (
          <div class="acct-toolbar" key={t.name}>
            <span class="acct-toolbar-label" title={t.name}>
              {displayToolName(t.name)}
            </span>
            <span class="acct-toolbar-track">
              <span class="acct-toolbar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span class="acct-toolbar-count">{formatNumber(t.count)}</span>
          </div>
        );
      })}
      {hidden > 0 ? (
        <button type="button" class="acct-show-more" onClick={() => setShowAll(true)}>
          Show {hidden} more
        </button>
      ) : null}
      {showAll && sorted.length > TOOL_TOP_DEFAULT ? (
        <button type="button" class="acct-show-more" onClick={() => setShowAll(false)}>
          Show less
        </button>
      ) : null}
    </div>
  );
}

/**
 * MCP rows carry two related counts (calls + distinct tools). Bars
 * would be noisy for two small numbers, so each row renders the
 * server name with two pill badges — readable at a glance, consistent
 * across all servers regardless of magnitude.
 */
function McpBlock({ byMcpServer }: { byMcpServer: McpServerUsage[] }) {
  return (
    <div class="acct-block">
      <BlockHeading>MCP servers</BlockHeading>
      {byMcpServer.map((s) => (
        <div class="acct-mcp-row" key={s.server}>
          <span class="acct-mcp-name">{s.server}</span>
          <span class="acct-pill">
            {formatNumber(s.toolCount)} call{s.toolCount === 1 ? "" : "s"}
          </span>
          <span class="acct-pill">
            {s.uniqueTools} tool{s.uniqueTools === 1 ? "" : "s"}
          </span>
        </div>
      ))}
    </div>
  );
}
