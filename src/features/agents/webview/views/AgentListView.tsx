/**
 * Agent list view: search bar, model filter, and a scope-grouped list of
 * agents. Large lists (> VIRTUALIZE_THRESHOLD agents) render through the
 * shared windowed `VirtualList`; smaller lists render plain grouped sections
 * so section headers stay simple.
 */
import { useEffect, useState } from "preact/hooks";
import { EmptyState } from "../../../../webview/components/EmptyState";
import { VirtualList } from "../../../../webview/components/VirtualList";
import { useDebounce } from "../../../../webview/hooks/useDebounce";
import type { Agent } from "../../types";
import { AgentItem } from "../components/AgentItem";
import { ModelFilter } from "../components/ModelFilter";
import { SearchBar } from "../components/SearchBar";
import {
  agents,
  filterModel,
  filteredAgents,
  groupedAgents,
  type ModelFilter as ModelFilterValue,
  modelCounts,
  searchQuery,
  selectAgent,
  selectedAgent,
} from "../signals";

/** Above this many filtered agents, switch to windowed rendering. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) used for virtualization; matches `agents.css`. */
const ROW_HEIGHT = 56;

export interface AgentListViewProps {
  onRefresh: () => void;
}

/** A flattened virtual row: either a scope header or an agent. */
type Row = { kind: "header"; label: string } | { kind: "agent"; agent: Agent };

export function AgentListView({ onRefresh }: AgentListViewProps) {
  // Local input state gives instant typing feedback; the debounced value is
  // committed to the shared signal that drives filtering.
  const [input, setInput] = useState(searchQuery.value);
  const debounced = useDebounce(input, 150);

  useEffect(() => {
    searchQuery.value = debounced.toLowerCase();
  }, [debounced]);

  const all = agents.value;
  const filtered = filteredAgents.value;
  const groups = groupedAgents.value;
  const selectedPath = selectedAgent.value?.path ?? null;

  const onModelChange = (value: ModelFilterValue) => {
    filterModel.value = value;
  };

  return (
    <div class="panel">
      <SearchBar value={input} onInput={setInput} onRefresh={onRefresh} />
      {all.length > 0 ? (
        <ModelFilter value={filterModel.value} counts={modelCounts.value} onChange={onModelChange} />
      ) : null}
      <div class="list agent-list">
        {all.length === 0 ? (
          <EmptyAgents />
        ) : filtered.length === 0 ? (
          <EmptyState title={input ? "No matching agents" : "No agents found"} />
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
function EmptyAgents() {
  return (
    <div class="agent-empty">
      <div class="agent-empty-title">No agents found</div>
      <div class="agent-empty-desc">
        Agents are <code>.md</code> files in your project's <code>.claude/agents/</code> directory.
        Each file uses YAML frontmatter with <code>name</code>, <code>description</code>, and{" "}
        <code>model</code> fields, followed by the agent's system prompt.
      </div>
    </div>
  );
}

/** Result-count caption shown above the grouped list. */
function CountCaption({ count }: { count: number }) {
  return (
    <div class="agent-list-count">
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
        items={rows}
        itemHeight={ROW_HEIGHT}
        renderItem={(row) =>
          row.kind === "header" ? (
            <div class="group-label agent-vrow">{row.label}</div>
          ) : (
            <div class="agent-vrow">
              <AgentItem
                agent={row.agent}
                active={selectedPath === row.agent.path}
                onSelect={selectAgent}
              />
            </div>
          )
        }
      />
    </>
  );
}
