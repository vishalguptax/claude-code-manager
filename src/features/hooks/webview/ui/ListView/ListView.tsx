/**
 * Hooks list view — search bar, add / refresh actions, scope filter pills,
 * and the hooks grouped by event type. Selecting a row sets `selectedHook`,
 * which flips the feature root over to the detail view.
 *
 * Large result sets (> VIRTUALIZE_THRESHOLD) render through the shared
 * <VirtualList /> as a flat, un-grouped list to keep scroll constant-time;
 * smaller sets keep the event-grouped layout that reads better for the
 * common handful-of-hooks case.
 */
import { Button, ScopeFilter, SearchInput, VirtualList } from "../../../../../webview/shared/ui";
import type { ScopeOption } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import { useApi } from "../../../../../webview/shared/hooks";
import type { Hook } from "../../../types";
import * as api from "../../api";
import type { Post } from "../../api";
import { eventLabel } from "../../lib";
import {
  countByScope,
  filteredHooks,
  groupedHooks,
  hooks,
  scopeFilter,
  searchQuery,
  selectedHook,
  type HookScopeFilter,
} from "../../model";
import { HookItem } from "../HookItem";
import { HooksEmpty } from "../HooksEmpty";

/** Above this many filtered rows, switch to the windowed flat list. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) used by the virtualizer. Matches hooks.css. */
const ITEM_HEIGHT = 64;

export function ListView() {
  const { post } = useApi();
  const send = post as Post;

  const open = (hook: Hook): void => {
    selectedHook.value = hook;
  };
  const toggle = (hook: Hook): void => api.toggleHookEnabled(send, hook);
  const remove = (hook: Hook): void => api.deleteHook(send, hook);

  const all = hooks.value;
  const filtered = filteredHooks.value;
  const groups = groupedHooks.value;

  // The Plugin segment only appears when at least one plugin hook exists,
  // matching the per-scope counts so empty scopes still read as "(0)".
  const pluginCount = countByScope("plugin");
  const scopeOptions: ScopeOption<HookScopeFilter>[] = [
    { value: "all", label: "All", count: all.length },
    { value: "global", label: "Global", count: countByScope("global") },
    { value: "project", label: "Project", count: countByScope("project") },
    { value: "local", label: "Local", count: countByScope("local") },
    ...(pluginCount > 0
      ? [{ value: "plugin" as HookScopeFilter, label: "Plugin", count: pluginCount }]
      : []),
  ];

  return (
    <div class="panel hooks-panel">
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          ariaLabel="Search hooks"
          placeholder="Search hooks..."
          debounceMs={150}
          onInput={(v) => {
            // Lowercased to match the signal's case-insensitive contract.
            searchQuery.value = v.toLowerCase();
          }}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="plus"
          title="Add a new hook"
          ariaLabel="Add a new hook"
          onClick={() => api.promptAddHook(send)}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh hooks"
          ariaLabel="Refresh hooks"
          onClick={() => api.getHooks(send)}
        />
      </div>

      {all.length > 0 ? (
        <ScopeFilter
          value={scopeFilter.value}
          options={scopeOptions}
          onChange={(s) => {
            scopeFilter.value = s;
          }}
        />
      ) : null}

      {renderBody({ all, filtered, groups, open, toggle, remove })}
    </div>
  );
}

interface BodyProps {
  all: Hook[];
  filtered: Hook[];
  groups: Array<[string, Hook[]]>;
  open: (hook: Hook) => void;
  toggle: (hook: Hook) => void;
  remove: (hook: Hook) => void;
}

function renderBody({ all, filtered, groups, open, toggle, remove }: BodyProps) {
  if (all.length === 0) {
    return <HooksEmpty />;
  }
  if (filtered.length === 0) {
    return <div class="empty">No matching hooks</div>;
  }

  const count = (
    <div class="hook-list-count">
      {`${filtered.length} hook${filtered.length === 1 ? "" : "s"}`}
    </div>
  );

  if (filtered.length > VIRTUALIZE_THRESHOLD) {
    return (
      <>
        {count}
        <VirtualList
          items={filtered}
          itemHeight={ITEM_HEIGHT}
          class="hook-virtual-list"
          renderItem={(hook) => (
            <HookItem hook={hook} onOpen={open} onToggle={toggle} onDelete={remove} />
          )}
        />
      </>
    );
  }

  return (
    <div class="list hook-list">
      {count}
      {groups.map(([event, eventHooks]) => (
        <div key={event} class={cx("hook-group")}>
          <div class="hook-group-label">{eventLabel(event)}</div>
          {eventHooks.map((hook) => (
            <HookItem
              key={`${hook.scope}:${hook.matcher}:${hook.command}`}
              hook={hook}
              onOpen={open}
              onToggle={toggle}
              onDelete={remove}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
