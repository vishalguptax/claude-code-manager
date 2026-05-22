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
import { useEffect, useState } from "preact/hooks";
import { Icon } from "../../../../webview/components/Icon";
import { VirtualList } from "../../../../webview/components/VirtualList";
import { cx } from "../../../../webview/utils/classnames";
import { useApi } from "../../../../webview/hooks/useApi";
import { useDebounce } from "../../../../webview/hooks/useDebounce";
import type { Hook } from "../../types";
import * as api from "../api";
import type { Post } from "../api";
import { eventLabel } from "../events";
import {
  countByScope,
  filteredHooks,
  groupedHooks,
  hooks,
  scopeFilter,
  searchQuery,
  selectedHook,
  type HookScopeFilter,
} from "../signals";
import { HookItem } from "../components/HookItem";
import { HooksEmpty } from "../components/HooksEmpty";
import { ScopeFilter } from "../components/ScopeFilter";

/** Above this many filtered rows, switch to the windowed flat list. */
const VIRTUALIZE_THRESHOLD = 50;
/** Fixed row height (px) used by the virtualizer. Matches hooks.css. */
const ITEM_HEIGHT = 64;

export function ListView() {
  const { post } = useApi();
  const send = post as Post;
  const [draft, setDraft] = useState(searchQuery.value);
  const debounced = useDebounce(draft, 150);

  // Push the debounced search term into the feature signal so the computed
  // `filteredHooks` recomputes. Lowercased to match the signal's contract.
  useEffect(() => {
    searchQuery.value = debounced.toLowerCase();
  }, [debounced]);

  const open = (hook: Hook): void => {
    selectedHook.value = hook;
  };
  const toggle = (hook: Hook): void => api.toggleHookEnabled(send, hook);
  const remove = (hook: Hook): void => api.deleteHook(send, hook);

  const all = hooks.value;
  const filtered = filteredHooks.value;
  const groups = groupedHooks.value;

  return (
    <div class="panel hooks-panel">
      <div class="search-row">
        <div class="feature-search">
          <input
            class="input"
            type="text"
            placeholder="Search hooks..."
            aria-label="Search hooks"
            value={draft}
            onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Escape") setDraft("");
            }}
          />
          {draft ? (
            <button
              type="button"
              class="search-btn"
              title="Clear (Esc)"
              aria-label="Clear search"
              onClick={() => setDraft("")}
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          class="search-side-btn"
          title="Add a new hook"
          aria-label="Add a new hook"
          onClick={() => api.promptAddHook(send)}
        >
          <Icon name="plus" size={14} />
        </button>
        <button
          type="button"
          class="search-side-btn"
          title="Refresh hooks"
          aria-label="Refresh hooks"
          onClick={() => api.getHooks(send)}
        >
          <Icon name="refresh-cw" size={14} />
        </button>
      </div>

      {all.length > 0 ? (
        <ScopeFilter
          active={scopeFilter.value}
          total={all.length}
          globalCount={countByScope("global")}
          projectCount={countByScope("project")}
          localCount={countByScope("local")}
          pluginCount={countByScope("plugin")}
          onChange={(s: HookScopeFilter) => {
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
