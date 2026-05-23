/**
 * Commands list view. Renders the shared search field and scope filter, then
 * the scope-grouped command rows. When the flattened row count exceeds the
 * virtualization threshold the rows are windowed with <VirtualList />.
 */
import { useMemo } from "preact/hooks";
import { Button, ScopeFilter, SearchInput, VirtualList } from "../../../../../webview/shared/ui";
import { useApi } from "../../../../../webview/shared/hooks";
import type { Command } from "../../../types";
import { getCommandsMsg, launchCommandInChatMsg, type Post } from "../../api";
import { buildRows, copyCommand, type Row } from "../../lib";
import {
  type ScopeFilter as ScopeFilterValue,
  claudeCodeInstalled,
  commands,
  countByScope,
  filteredCommands,
  scopeFilter,
  searchQuery,
  selected,
} from "../../model";
import { CommandItem } from "../CommandItem";

/** Above this flattened row count, the list is windowed for scroll perf. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) shared by header and item rows for virtualization. */
const ROW_HEIGHT = 56;

export function CommandsListView() {
  const { post } = useApi();
  const send = post as Post;

  const filtered = filteredCommands.value;
  const total = commands.value.length;
  const showChat = claudeCodeInstalled.value;
  const rows = useMemo(() => buildRows(filtered), [filtered]);

  const onSelect = (command: Command): void => {
    selected.value = command;
  };
  const onLaunchChat = (command: Command): void => send(launchCommandInChatMsg(command.name));

  // The shared <SearchInput> debounces internally; it emits the resolved query
  // which we lowercase into the shared signal that drives `filteredCommands`.
  const onSearch = (value: string): void => {
    searchQuery.value = value.toLowerCase();
  };

  const scopeOptions: { value: ScopeFilterValue; label: string; count: number }[] = [
    { value: "all", label: "All", count: total },
    { value: "builtin", label: "Built-in", count: countByScope("builtin") },
    { value: "project", label: "Project", count: countByScope("project") },
    { value: "global", label: "Global", count: countByScope("global") },
  ];
  const pluginCount = countByScope("plugin");
  if (pluginCount > 0) {
    scopeOptions.push({ value: "plugin", label: "Plugin", count: pluginCount });
  }

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
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={onSearch}
          placeholder="Search commands..."
          ariaLabel="Search commands"
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh commands"
          ariaLabel="Refresh commands"
          onClick={() => send(getCommandsMsg())}
        />
      </div>

      {total > 0 ? (
        <ScopeFilter
          value={scopeFilter.value}
          options={scopeOptions}
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
