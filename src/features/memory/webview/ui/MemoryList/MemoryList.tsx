/**
 * The Memory tab's list view: a toolbar (search, project scope, health lens)
 * over the rows of one or every project.
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
  SearchInput,
  Segmented,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { MemoryFile } from "../../../types";
import { type MemoryLens } from "../../lib";
import {
  lens,
  loading,
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
        <span class="mem-name">{memory.meta.name}</span>
        {memory.meta.type !== "" && (
          <Badge text={memory.meta.type} variant="default" class="mem-type" />
        )}
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

export function MemoryList({ onSelect, onRefresh }: MemoryListProps) {
  const current = store.value;
  const counts = totals.value;
  const memories = visibleMemories.value;
  const scope = selectedProject.value;

  const lensOptions: { value: MemoryLens; label: string }[] = [
    { value: "all", label: `All ${counts.total}` },
    { value: "orphans", label: `Orphans ${counts.orphans}` },
    { value: "broken", label: `Broken ${counts.broken}` },
  ];

  if (!loading.value && current !== null && !current.enabled) {
    return (
      <EmptyState
        icon="package"
        title="Auto-memory is off"
        description="Claude Code's autoMemoryEnabled setting is false, so it is not writing memories. Turn it on in settings.json and they will appear here."
      />
    );
  }

  if (!loading.value && counts.total === 0) {
    return (
      <EmptyState
        icon="package"
        title="No memories yet"
        description={`Claude Code writes one file per fact it learns. Nothing has been written under ${current?.root ?? "the memory directory"} yet.`}
      />
    );
  }

  return (
    <div class="mem-view">
      <div class="mem-toolbar">
        <SearchInput
          value={searchQuery.value}
          onInput={(v) => {
            searchQuery.value = v;
          }}
          placeholder="Search memories"
          ariaLabel="Search memories"
        />
        <Dropdown
          value={scope ?? ""}
          options={projectOptions()}
          onChange={(v) => {
            selectedProject.value = v === "" ? null : v;
          }}
          icon="folder"
          ariaLabel="Filter by project"
        />
        <Button
          variant="icon"
          iconName="refresh-cw"
          onClick={onRefresh}
          title="Reload memories from disk"
          ariaLabel="Reload memories from disk"
        />
      </div>

      <div class="mem-toolbar">
        <Segmented<MemoryLens>
          value={lens.value}
          options={lensOptions}
          onChange={(v) => {
            lens.value = v;
          }}
          ariaLabel="Filter by memory health"
          size="sm"
        />
      </div>

      <div class="list-count">
        {memories.length === 1 ? "1 memory" : `${memories.length} memories`}
      </div>

      {memories.length === 0 ? (
        <EmptyState compact title="Nothing matches" description="Clear the search or lens." />
      ) : memories.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualList<MemoryFile>
          items={memories}
          itemHeight={ROW_HEIGHT}
          label="Memories"
          renderItem={(memory) => (
            <MemoryRow memory={memory} showProject={scope === null} onSelect={onSelect} />
          )}
        />
      ) : (
        <div class="mem-list" role="list" aria-label="Memories">
          {memories.map((memory) => (
            <div role="listitem" key={memory.id}>
              <MemoryRow memory={memory} showProject={scope === null} onSelect={onSelect} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
