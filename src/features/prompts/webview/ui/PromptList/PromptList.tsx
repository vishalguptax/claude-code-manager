/**
 * The Prompt History view: a search field, a project filter, and every prompt
 * the user has ever typed, newest first.
 *
 * Windowed unconditionally. The list is four thousand rows on a machine that
 * has had Claude Code installed for a few months and only grows, so there is
 * no "small enough to render flat" case worth branching on.
 */
import { Dropdown, EmptyState, ErrorBanner, SearchInput, VirtualList } from "../../../../../webview/shared/ui";
import type { PromptEntry } from "../../../types";
import { ALL_PROJECTS } from "../../lib";
import {
  errorMessage,
  loading,
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
const ROW_HEIGHT = 64;

export interface PromptListProps {
  onCopy: (text: string) => void;
  onOpenSession: (sessionId: string) => void;
}

export function PromptList({ onCopy, onOpenSession }: PromptListProps) {
  const all = prompts.value;
  const rows = visiblePrompts.value;
  const err = errorMessage.value;
  const projectOptions = projects.value;
  const filtering = searchQuery.value.trim() !== "" || projectFilter.value !== ALL_PROJECTS;

  if (!loading.value && all.length === 0 && !err) {
    return (
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
    );
  }

  return (
    <div class="prompt-view">
      {err ? <ErrorBanner errors={[err]} /> : null}
      <div class="prompt-toolbar">
        <div class="prompt-search">
          <SearchInput
            value={searchQuery.value}
            onInput={(value) => {
              searchQuery.value = value;
            }}
            placeholder="Search every prompt you have sent"
            ariaLabel="Search prompt history"
          />
        </div>
        {projectOptions.length > 1 ? (
          <Dropdown
            class="prompt-project-filter"
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
            ariaLabel="Filter prompts by project"
          />
        ) : null}
      </div>
      <div class="list-count">
        {rows.length} {rows.length === 1 ? "prompt" : "prompts"}
        {filtering ? ` of ${all.length}` : ""}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          compact
          title="No prompts match"
          description="Try fewer words, or switch the project filter back to all projects."
        />
      ) : (
        <VirtualList<PromptEntry>
          label="Prompt history"
          class="prompt-list"
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
