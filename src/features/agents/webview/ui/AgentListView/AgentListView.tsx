/**
 * Agent list view: search row, model filter, and a scope-grouped list of
 * agents. Large lists (> VIRTUALIZE_THRESHOLD agents) render through the
 * shared windowed `VirtualList`; smaller lists render plain grouped sections
 * so section headers stay simple.
 *
 * Search uses the shared <SearchInput> (debounced) and the refresh affordance
 * is a shared icon <Button>; the model filter is the shared <Dropdown>, the
 * same control the sessions project filter uses, with each model's count as a
 * trailing badge.
 *
 * It was a segmented control, which is the right primitive for two to four
 * short, fixed options. This filter is neither: five options that each carry a
 * count ("Sonnet (18)") need ~440px of track, so in a 300px sidebar it always
 * wrapped onto a second line and no layout rule made two ragged rows read as
 * one control. The option set is also open-ended — it grows with every model
 * Claude Code ships. A dropdown costs one line at any width and any number of
 * models.
 */
import {
  Button,
  EmptyState,
  Dropdown,
  type DropdownOption,
  ErrorBanner,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { Agent } from "../../../types";
import {
  agents,
  filterModel,
  filteredAgents,
  groupedAgents,
  type ModelFilter as ModelFilterValue,
  modelCounts,
  parseErrors,
  searchQuery,
  selectAgent,
  selectedAgent,
} from "../../model";
import { AgentItem } from "../AgentItem";

/** Above this many filtered agents, switch to windowed rendering. */
const VIRTUALIZE_THRESHOLD = 50;
/**
 * Estimated row height (px) for the virtualizer. Only an estimate: VirtualList
 * measures each rendered row and corrects its offsets, so this affects the
 * scrollbar before the first measure and nothing after it. It deliberately
 * does NOT have to match a CSS rule — the fixed-height wrapper that used to
 * mirror it is gone, because pinning a height clipped any row whose content
 * grew.
 */
const ROW_HEIGHT = 56;

/** Model filter options (label + value); counts are injected per render. */
const MODEL_OPTIONS: ReadonlyArray<{ value: ModelFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
  { value: "inherit", label: "Inherit" },
];

export interface AgentListViewProps {
  onRefresh: () => void;
  onNew: () => void;
}

/** A flattened virtual row: either a scope header or an agent. */
type Row = { kind: "header"; label: string } | { kind: "agent"; agent: Agent };

export function AgentListView({ onRefresh, onNew }: AgentListViewProps) {
  const all = agents.value;
  const filtered = filteredAgents.value;
  const groups = groupedAgents.value;
  const selectedPath = selectedAgent.value?.path ?? null;
  const counts = modelCounts.value;

  const onModelChange = (value: ModelFilterValue) => {
    filterModel.value = value;
  };

  const modelOptions: DropdownOption[] = MODEL_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    badge: counts[opt.value],
  }));

  return (
    <div class="panel">
      <ErrorBanner errors={parseErrors.value} />
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={(v) => {
            searchQuery.value = v.toLowerCase();
          }}
          placeholder="Search"
          ariaLabel="Search agents"
          debounceMs={150}
        />
        <Button
          variant="icon"
          iconName="plus"
          onClick={onNew}
          title="New agent"
          ariaLabel="New agent"
        />
        <Button
          variant="icon"
          iconName="refresh-cw"
          onClick={onRefresh}
          title="Refresh agents"
          ariaLabel="Refresh agents"
        />
      </div>
      {all.length > 0 ? (
        <div class="filter-row">
          <Dropdown
            ariaLabel="Filter by model"
            icon="bot"
            value={filterModel.value}
            options={modelOptions}
            // Dropdown is not generic over its value type; the options come
            // from MODEL_OPTIONS, so every value it can emit is a
            // ModelFilterValue.
            onChange={(next) => onModelChange(next as ModelFilterValue)}
          />
        </div>
      ) : null}
      <div class="list agent-list">
        {all.length === 0 ? (
          <EmptyAgents onNew={onNew} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              searchQuery.value || filterModel.value !== "all"
                ? "No matching agents"
                : "No agents found"
            }
          />
        ) : filtered.length > VIRTUALIZE_THRESHOLD ? (
          <VirtualAgentRows groups={groups} count={filtered.length} selectedPath={selectedPath} />
        ) : (
          <GroupedAgents groups={groups} count={filtered.length} selectedPath={selectedPath} />
        )}
      </div>
    </div>
  );
}

/** Empty state shown when no agents exist anywhere. */
function EmptyAgents({ onNew }: { onNew: () => void }) {
  return (
    <EmptyState
      icon="bot"
      title="No agents yet"
      description={
        <>
          An agent is a <code>.md</code> file in <code>.claude/agents/</code>. Its YAML
          frontmatter carries <code>name</code>, <code>description</code> and{" "}
          <code>model</code>; everything after it is the agent's system prompt.
        </>
      }
    >
      <Button variant="primary" iconName="plus" onClick={onNew}>
        New agent
      </Button>
    </EmptyState>
  );
}

/** Result-count caption shown above the grouped list. */
function CountCaption({ count }: { count: number }) {
  return (
    <div class="list-count">
      {count} agent{count !== 1 ? "s" : ""}
    </div>
  );
}

/** Plain (non-virtualized) grouped rendering for small lists. */
function GroupedAgents({
  groups,
  count,
  selectedPath,
}: {
  groups: Array<{ label: string; items: Agent[] }>;
  count: number;
  selectedPath: string | null;
}) {
  return (
    <>
      <CountCaption count={count} />
      {groups.map((group) => (
        <div key={group.label}>
          <div class="group-label">{group.label}</div>
          {group.items.map((agent) => (
            <AgentItem
              key={agent.path}
              agent={agent}
              active={selectedPath === agent.path}
              onSelect={selectAgent}
            />
          ))}
        </div>
      ))}
    </>
  );
}

/** Windowed rendering for large lists; flattens groups into uniform rows. */
function VirtualAgentRows({
  groups,
  count,
  selectedPath,
}: {
  groups: Array<{ label: string; items: Agent[] }>;
  count: number;
  selectedPath: string | null;
}) {
  const rows: Row[] = [];
  for (const group of groups) {
    rows.push({ kind: "header", label: group.label });
    for (const agent of group.items) rows.push({ kind: "agent", agent });
  }

  return (
    <>
      <CountCaption count={count} />
      <VirtualList<Row>
        label="Agents"
        items={rows}
        itemHeight={ROW_HEIGHT}
        renderItem={(row) =>
          row.kind === "header" ? (
            <div class="group-label">{row.label}</div>
          ) : (
            <AgentItem
              agent={row.agent}
              active={selectedPath === row.agent.path}
              onSelect={selectAgent}
            />
          )
        }
      />
    </>
  );
}
