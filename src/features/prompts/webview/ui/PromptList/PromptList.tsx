/**
 * The Prompt History list view: the shared search row, a project filter, and
 * every prompt the user has ever typed, newest first.
 *
 * Shaped like the other list tabs (see `features/skills/webview/ui/ListView`):
 * the root is `.panel`, so `tabs.css` gives it the pane's bounded height, the
 * search field sits in the shared `.search-row` (whose 2xl inset lines its
 * left edge up with the row text below), and the windowed list is the single
 * scroll container inside it.
 *
 * Windowed unconditionally. The list is four thousand rows on a machine that
 * has had Claude Code installed for a few months and only grows, so there is
 * no "small enough to render flat" case worth branching on.
 */
import {
  Button,
  Dropdown,
  EmptyState,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { PromptEntry } from "../../../types";
import { ALL_PROJECTS } from "../../lib";
import {
  projectFilter,
  projects,
  prompts,
  searchQuery,
  visiblePrompts,
} from "../../model";
import { PromptRow } from "../PromptRow";

/**
 * Estimated row height (px) for the virtualizer. Only an estimate:
 * <VirtualList> measures each row after layout, so this sizes the scrollbar
 * before the first paint and nothing else. Set to a two-line prompt plus its
 * meta row, the common case.
 */
const ROW_HEIGHT = 72;

export interface PromptListProps {
  onCopy: (text: string) => void;
  onOpenSession: (sessionId: string) => void;
  onRefresh: () => void;
}

export function PromptList({ onCopy, onOpenSession, onRefresh }: PromptListProps) {
  const all = prompts.value;
  const rows = visiblePrompts.value;
  const projectOptions = projects.value;
  const filtering = searchQuery.value.trim() !== "" || projectFilter.value !== ALL_PROJECTS;

  return (
    <div class="panel">
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={(value) => {
            searchQuery.value = value;
          }}
          placeholder="Search"
          ariaLabel="Search prompts"
          debounceMs={150}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh prompt history"
          ariaLabel="Refresh prompt history"
          onClick={onRefresh}
        />
      </div>

      {projectOptions.length > 1 ? (
        <div class="filter-row">
          <Dropdown
            value={projectFilter.value}
            options={[
              { value: ALL_PROJECTS, label: "All projects", badge: all.length },
              ...projectOptions.map((p) => ({
                value: p.path,
                label: p.name,
                badge: p.count,
              })),
            ]}
            onChange={(value) => {
              projectFilter.value = value;
            }}
            icon="folder"
            ariaLabel="Filter by project"
          />
        </div>
      ) : null}

      {all.length > 0 ? (
        <div class="list-count">
          {rows.length} {rows.length === 1 ? "prompt" : "prompts"}
          {filtering ? ` of ${all.length}` : ""}
        </div>
      ) : null}

      {all.length === 0 ? (
        <div class="list">
          <EmptyState
            icon="history"
            title="No prompt history yet"
            description={
              <>
                Claude Code appends every prompt you type to{" "}
                <code>~/.claude/history.jsonl</code>. Once you have sent one from the
                CLI, it shows up here.
              </>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div class="list">
          <EmptyState
            icon="search-slash"
            title="No matching prompts"
            description="Try fewer words, or switch the project filter back to all projects."
          />
        </div>
      ) : (
        <VirtualList<PromptEntry>
          label="Prompt history"
          class="list"
          items={rows}
          itemHeight={ROW_HEIGHT}
          renderItem={(entry) => (
            <PromptRow entry={entry} onCopy={onCopy} onOpenSession={onOpenSession} />
          )}
        />
      )}
    </div>
  );
}
