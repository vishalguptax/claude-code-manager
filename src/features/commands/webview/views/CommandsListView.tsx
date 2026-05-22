/**
 * Commands list view. Renders the search row, scope filter, and the
 * scope-grouped command rows. When the flattened row count exceeds the
 * virtualization threshold the rows are windowed with <VirtualList />.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { VirtualList } from "../../../../webview/shared/ui";
import { useApi } from "../../../../webview/shared/hooks";
import { useDebounce } from "../../../../webview/shared/hooks";
import type { Command } from "../../types";
import { getCommandsMsg, launchCommandInChatMsg, type Post } from "../api";
import { CommandItem } from "../components/CommandItem";
import { CommandSearch } from "../components/CommandSearch";
import { ScopeFilter } from "../components/ScopeFilter";
import {
  type ScopeFilter as ScopeFilterValue,
  claudeCodeInstalled,
  commands,
  countByScope,
  filteredCommands,
  scopeFilter,
  searchQuery,
  selected,
} from "../signals";

/** Above this flattened row count, the list is windowed for scroll perf. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) shared by header and item rows for virtualization. */
const ROW_HEIGHT = 56;

/** A row in the flattened, group-labelled list. */
type Row = { kind: "header"; label: string } | { kind: "item"; command: Command };

/** Human-readable group label for a command's scope. */
function groupLabel(command: Command): string {
  if (command.scope === "builtin") return "Built-in";
  if (command.scope === "project") return "Project Commands";
  if (command.scope === "plugin") return `Plugin: ${command.pluginName ?? "unknown"}`;
  return "Global Commands";
}

/** Flatten the sorted command list into header + item rows, grouped by scope. */
function buildRows(list: Command[]): Row[] {
  const rows: Row[] = [];
  let lastLabel: string | null = null;
  for (const command of list) {
    const label = groupLabel(command);
    if (label !== lastLabel) {
      rows.push({ kind: "header", label });
      lastLabel = label;
    }
    rows.push({ kind: "item", command });
  }
  return rows;
}

/** Copy a slash command to the clipboard. */
function copyCommand(command: Command): void {
  navigator.clipboard?.writeText(`/${command.name}`);
}

export function CommandsListView() {
  const { post } = useApi();
  const send = post as Post;

  // Search is debounced locally before it touches the shared signal so typing
  // does not thrash the computed filter on every keystroke.
  const [draftQuery, setDraftQuery] = useState(searchQuery.value);
  const debouncedQuery = useDebounce(draftQuery, 150);
  useEffect(() => {
    searchQuery.value = debouncedQuery.toLowerCase();
  }, [debouncedQuery]);

  const filtered = filteredCommands.value;
  const total = commands.value.length;
  const showChat = claudeCodeInstalled.value;
  const rows = useMemo(() => buildRows(filtered), [filtered]);

  const onSelect = (command: Command): void => {
    selected.value = command;
  };
  const onLaunchChat = (command: Command): void => send(launchCommandInChatMsg(command.name));
  const clearSearch = (): void => {
    setDraftQuery("");
    searchQuery.value = "";
  };

  const renderItem = (row: Row): preact.JSX.Element => {
    if (row.kind === "header") {
      return (
        <div class="cmd-group-label" key={`h:${row.label}`}>
          {row.label}
        </div>
      );
    }
    const command = row.command;
    const active =
      selected.value?.name === command.name && selected.value?.scope === command.scope;
    return (
      <CommandItem
        key={`${command.scope}:${command.name}`}
        command={command}
        active={active}
        showChatButton={showChat}
        onSelect={onSelect}
        onCopy={copyCommand}
        onLaunchChat={onLaunchChat}
      />
    );
  };

  return (
    <div class="panel">
      <CommandSearch
        query={draftQuery}
        onQueryChange={setDraftQuery}
        onClear={clearSearch}
        onRefresh={() => send(getCommandsMsg())}
      />

      {total > 0 ? (
        <ScopeFilter
          active={scopeFilter.value}
          total={total}
          builtinCount={countByScope("builtin")}
          projectCount={countByScope("project")}
          globalCount={countByScope("global")}
          pluginCount={countByScope("plugin")}
          onChange={(value: ScopeFilterValue) => {
            scopeFilter.value = value;
          }}
        />
      ) : null}

      <div class="list">
        {total === 0 ? (
          <EmptyCommands />
        ) : filtered.length === 0 ? (
          <div class="empty">
            {searchQuery.value ? "No matching commands" : "No commands found"}
          </div>
        ) : (
          <>
            <div class="cmd-list-count">
              {filtered.length} command{filtered.length === 1 ? "" : "s"}
            </div>
            {rows.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualList items={rows} itemHeight={ROW_HEIGHT} renderItem={renderItem} />
            ) : (
              rows.map(renderItem)
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Empty-state shown when no commands exist at all. */
function EmptyCommands() {
  return (
    <div class="cmd-empty">
      <div class="cmd-empty-title">No commands yet</div>
      <div class="cmd-empty-desc">
        Custom slash commands are markdown files stored in <code>~/.claude/commands/</code> (global)
        and <code>.claude/commands/</code> (project). Each <code>.md</code> file becomes a{" "}
        <code>/command</code> named after the file.
      </div>
    </div>
  );
}
