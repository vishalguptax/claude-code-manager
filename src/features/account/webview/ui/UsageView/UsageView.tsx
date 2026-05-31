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
  formatMoneyCompact,
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
 * Per-model colour. Hue encodes the family (blue=opus, amber=sonnet,
 * green=haiku), lightness encodes recency within the family so Opus 4.8
 * reads brighter than Opus 4.5 even when they sit side-by-side. Values
 * chosen for ≥3:1 contrast against the panel in both themes.
 */
function modelFamilyColor(model: string): string {
  const m = model.match(/claude-(opus|sonnet|haiku)-(\d+)-?(\d*)/i);
  if (!m) return "hsl(220, 8%, 55%)";
  const family = m[1].toLowerCase();
  const minor = m[3] ? parseInt(m[3], 10) : 0;
  const hue = family === "opus" ? 220 : family === "sonnet" ? 32 : 155;
  const sat = family === "haiku" ? 60 : 75;
  // Newer minor version → lighter shade. 4.0→40%, 4.5→55%, 4.8→64%.
  // 3-percentage-point steps + 40 floor keeps every adjacent pair
  // visibly distinct while staying readable on the panel.
  const lightness = Math.max(35, Math.min(70, 40 + minor * 3));
  return `hsl(${hue}, ${sat}%, ${lightness}%)`;
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
/** Drop Claude CLI's diagnostic model (and any other non-Claude entry
 * with zero usage) so the legend doesn't trail a "0% · —" row that
 * teaches the user nothing. Their tokens stay in the totals. */
function visibleModels(list: ModelStats[]): ModelStats[] {
  return list.filter((m) => {
    if (m.model === "<synthetic>") return false;
    if (m.totalTokens === 0 && m.costUsd === 0) return false;
    return true;
  });
}

function ModelsBlock({ u }: { u: UsageStats }) {
  const shown = visibleModels(u.byModel);
  const total = shown.reduce((s, m) => s + m.totalTokens, 0);
  const segments = shown.map((m) => ({
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
          <span
            class="acct-cost-amount"
            title={formatMoney(Math.round(u.totalCostUsd * 100), "USD")}
          >
            {formatMoneyCompact(Math.round(u.totalCostUsd * 100), "USD")}
          </span>
        </div>
      ) : null}
      <div class="acct-models-layout">
        <Donut segments={segments} />
        <div class="acct-model-legend">
          {shown.map((m) => (
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

/**
 * One legend row. Cost + share share a column (`$22.4K · 52%`) so the
 * legend stays narrow enough to balance the donut at sidebar widths.
 * Full precise cost lives in the title for hover.
 */
function ModelLegendRow({ m, total }: { m: ModelStats; total: number }) {
  const sharePct = total > 0 ? Math.round((m.totalTokens / total) * 100) : 0;
  const cost = m.costUsd > 0 ? formatMoneyCompact(Math.round(m.costUsd * 100), "USD") : "—";
  const preciseCost =
    m.costUsd > 0 ? formatMoney(Math.round(m.costUsd * 100), "USD") : "";
  return (
    <div class="acct-model-row" title={preciseCost ? `${m.model} · ${preciseCost}` : m.model}>
      <span class="acct-model-dot" style={{ background: modelFamilyColor(m.model) }} />
      <span class="acct-model-name">{formatModelName(m.model)}</span>
      <span class="acct-model-share">
        {cost}
        {sharePct > 0 ? ` · ${sharePct}%` : ""}
      </span>
    </div>
  );
}

/**
 * Ranked text rows for projects + tools. Bars were noisy here — the
 * data is "rank + magnitude" and a right-aligned tabular column reads
 * faster than a bar visualization at this density. Names ellipsize on
 * the left and full path is preserved in the row title for hover.
 */
function ProjectsBlock({ byProject }: { byProject: ProjectStats[] }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? byProject : byProject.slice(0, PROJECT_TOP_DEFAULT);
  const hidden = byProject.length - list.length;
  return (
    <div class="acct-block">
      <BlockHeading>Projects</BlockHeading>
      {list.map((p) => (
        <div class="acct-data-row" key={p.slug} title={p.path}>
          <span class="acct-data-name">{shortenProjectPath(p.path)}</span>
          <span class="acct-data-num">{formatNumber(p.tokens)}</span>
          <span class="acct-data-sub">
            {p.sessions} sess
          </span>
        </div>
      ))}
      <ShowMore
        showAll={showAll}
        setShowAll={setShowAll}
        hidden={hidden}
        total={byProject.length}
        threshold={PROJECT_TOP_DEFAULT}
      />
    </div>
  );
}

function ToolsBlock({ byTool }: { byTool: UsageStats["byTool"] }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? byTool : byTool.slice(0, TOOL_TOP_DEFAULT);
  const hidden = byTool.length - list.length;
  return (
    <div class="acct-block">
      <BlockHeading>Tools</BlockHeading>
      {list.map((t) => (
        <div class="acct-data-row" key={t.name} title={t.name}>
          <span class="acct-data-name">{displayToolName(t.name)}</span>
          <span class="acct-data-num">{formatNumber(t.count)}</span>
        </div>
      ))}
      <ShowMore
        showAll={showAll}
        setShowAll={setShowAll}
        hidden={hidden}
        total={byTool.length}
        threshold={TOOL_TOP_DEFAULT}
      />
    </div>
  );
}

/** Shared expand/collapse toggle for the ranked-text blocks. */
function ShowMore({
  showAll,
  setShowAll,
  hidden,
  total,
  threshold,
}: {
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  hidden: number;
  total: number;
  threshold: number;
}) {
  if (hidden > 0) {
    return (
      <button type="button" class="acct-show-more" onClick={() => setShowAll(true)}>
        Show {hidden} more
      </button>
    );
  }
  if (showAll && total > threshold) {
    return (
      <button type="button" class="acct-show-more" onClick={() => setShowAll(false)}>
        Show less
      </button>
    );
  }
  return null;
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
