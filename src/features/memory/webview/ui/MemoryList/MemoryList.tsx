/**
 * The Memory tab's list view: the standard panel chrome — search row, filter
 * row, scope filter, count caption, list — over the rows of one or every
 * project.
 *
 * The two health lenses are the reason this tab exists. A memory store grows
 * silently every session, and the failure modes are invisible from the
 * filesystem: a `[[link]]` whose target was renamed or deleted, and a memory
 * nothing points at. Both are one click from here.
 */
import {
  Badge,
  Button,
  Dropdown,
  type DropdownOption,
  EmptyState,
  ListItem,
  ScopeFilter,
  type ScopeOption,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { MemoryFile } from "../../../types";
import { type MemoryLens } from "../../lib";
import {
  lens,
  projects,
  searchQuery,
  selectedProject,
  store,
  totals,
  visibleMemories,
} from "../../model";

export interface MemoryListProps {
  /** Open one memory's detail view. */
  onSelect: (id: string) => void;
  /** Re-read the store from disk. */
  onRefresh: () => void;
}

/**
 * Above this many rows the list windows through <VirtualList />. Matches the
 * threshold the other list features use; the store on a busy machine is
 * already in the tens and only ever grows.
 */
const VIRTUALIZE_THRESHOLD = 50;

/**
 * Estimated row height (px) for the virtualizer. Only an estimate —
 * VirtualList measures the real heights after layout — but a close one keeps
 * the scrollbar honest on first paint. Three lines plus padding.
 */
const ROW_HEIGHT = 72;

/** The project scope options, with each project's memory count as a badge. */
function projectOptions(): DropdownOption[] {
  return [
    { value: "", label: "All projects", badge: totals.value.total },
    ...projects.value.map((p) => ({
      value: p.slug,
      label: p.label,
      badge: p.memories.length,
    })),
  ];
}

/** Human label for a project slug, falling back to the slug itself. */
function projectLabel(slug: string): string {
  return projects.value.find((p) => p.slug === slug)?.label ?? slug;
}

/** One list row. Keyed by `memory.id`, which is unique across projects. */
function MemoryRow({
  memory,
  showProject,
  onSelect,
}: {
  memory: MemoryFile;
  showProject: boolean;
  onSelect: (id: string) => void;
}) {
  const broken = memory.links.filter((l) => !l.resolved).length;
  return (
    <ListItem class="mem-item" onClick={() => onSelect(memory.id)}>
      <div class="mem-row-main">
        <span class="mem-name" title={memory.meta.name}>
          {memory.meta.name}
        </span>
        {memory.meta.type !== "" && <Badge text={memory.meta.type} class="mem-type" />}
        {memory.orphan && (
          <Badge
            text="orphan"
            variant="status"
            title="Nothing links here and MEMORY.md does not list it"
          />
        )}
        {broken > 0 && (
          <Badge
            text={broken === 1 ? "1 broken link" : `${broken} broken links`}
            variant="danger"
            title="This memory references a slug no file declares"
          />
        )}
        {!memory.hasFrontmatter && (
          <Badge
            text="no frontmatter"
            variant="status"
            title="The file has no --- block; it is shown as written"
          />
        )}
      </div>
      <div class="mem-desc">
        {memory.meta.description === "" ? memory.excerpt : memory.meta.description}
      </div>
      <div class="mem-row-meta">
        {showProject && <span class="mem-project">{projectLabel(memory.project)}</span>}
        <span class="mem-file">{memory.fileName}</span>
      </div>
    </ListItem>
  );
}

/**
 * The empty state for a list that has memories in the store but none in view.
 * Which of the three filters emptied it decides the copy, because "clear the
 * search" is useless advice to someone who filtered by lens instead.
 */
function NothingInView({ scope }: { scope: string | null }) {
  if (searchQuery.value.trim() !== "") {
    return (
      <EmptyState
        icon="search-slash"
        title="No matching memories"
        description="Try a different keyword, or clear the search to see every memory."
      />
    );
  }
  if (lens.value === "orphans") {
    return (
      <EmptyState
        icon="brain"
        title="No orphans here"
        description="Every memory in view is linked from another one or listed in MEMORY.md."
      />
    );
  }
  if (lens.value === "broken") {
    return (
      <EmptyState
        icon="brain"
        title="No broken links"
        description="Every [[link]] in view resolves to a memory that exists."
      />
    );
  }
  return (
    <EmptyState
      icon="brain"
      title="No memories in this project"
      description={`Claude Code has not written anything for ${
        scope === null ? "this project" : projectLabel(scope)
      } yet.`}
    />
  );
}

export function MemoryList({ onSelect, onRefresh }: MemoryListProps) {
  const current = store.value;
  const counts = totals.value;
  const memories = visibleMemories.value;
  const scope = selectedProject.value;
  const disabled = current !== null && !current.enabled;
  // The filters only earn their space once there is something to filter, and
  // they must not imply a store that Claude Code is not writing to.
  const filterable = !disabled && counts.total > 0;

  const lensOptions: ScopeOption<MemoryLens>[] = [
    { value: "all", label: "All", count: counts.total },
    { value: "orphans", label: "Orphans", count: counts.orphans },
    { value: "broken", label: "Broken", count: counts.broken },
  ];

  return (
    <div class="panel" id="memoryListView">
      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={(v) => {
            searchQuery.value = v;
          }}
          placeholder="Search"
          ariaLabel="Search memories"
          debounceMs={150}
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          onClick={onRefresh}
          title="Refresh memories"
          ariaLabel="Refresh memories"
        />
      </div>

      {filterable ? (
        <>
          <div class="filter-row">
            <Dropdown
              value={scope ?? ""}
              options={projectOptions()}
              onChange={(v) => {
                selectedProject.value = v === "" ? null : v;
              }}
              icon="folder"
              ariaLabel="Filter by project"
            />
          </div>
          <ScopeFilter<MemoryLens>
            value={lens.value}
            options={lensOptions}
            onChange={(v) => {
              lens.value = v;
            }}
            ariaLabel="Filter by memory health"
          />
          <div class="list-count">
            {memories.length === 1 ? "1 memory" : `${memories.length} memories`}
          </div>
        </>
      ) : null}

      {/* `disabled` is checked here too: a store can hold memories from before
          the setting was switched off, and "auto-memory is off" is the thing to
          say about it — not a list of what it used to write. */}
      {!disabled && memories.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualList<MemoryFile>
          class="list"
          items={memories}
          itemHeight={ROW_HEIGHT}
          label="Memories"
          renderItem={(memory) => (
            <MemoryRow memory={memory} showProject={scope === null} onSelect={onSelect} />
          )}
        />
      ) : (
        <div class="list">
          {disabled ? (
            <EmptyState
              icon="brain"
              title="Auto-memory is off"
              description={
                <>
                  Claude Code's <code>autoMemoryEnabled</code> setting is false, so it is not
                  writing memories. Turn it on in <code>settings.json</code> and they will appear
                  here.
                </>
              }
            />
          ) : counts.total === 0 ? (
            <EmptyState
              icon="brain"
              title="No memories yet"
              description={`Claude Code writes one file per fact it learns. Nothing has been \
written under ${current?.root ?? "the memory directory"} yet.`}
            />
          ) : memories.length === 0 ? (
            <NothingInView scope={scope} />
          ) : (
            memories.map((memory) => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                showProject={scope === null}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
