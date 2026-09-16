/**
 * One memory's detail view: its frontmatter, its excerpt, the graph around it
 * (outbound links, backlinks, index entry) and the three actions the host
 * offers. Built from the shared detail chrome (`.d-head`, `.d-actions`,
 * `.d-section`) so it reads as a sibling of the Skills and Commands detail
 * views rather than a layout of its own.
 *
 * The graph is the point. A list row can say "2 broken links"; only here can
 * the user see WHICH slugs resolve to nothing, and which other memories would
 * be orphaned by deleting this one. Delete is deliberately last and the host
 * owns its confirmation, so this component never learns enough to skip it.
 */
import { useEffect, useRef } from "preact/hooks";
import { BackButton, Badge, Button, EmptyState } from "../../../../../webview/shared/ui";
import type { MemoryFile } from "../../../types";
import { backlinksOf, indexEntryOf, projectOf, resolveLink } from "../../lib";
import { selectedMemory, store } from "../../model";

export interface MemoryDetailProps {
  /** Return to the list. */
  onBack: () => void;
  /** Open another memory's detail view (used by the link lists). */
  onSelect: (id: string) => void;
  onOpen: (memory: MemoryFile) => void;
  onReveal: (memory: MemoryFile) => void;
  onDelete: (memory: MemoryFile) => void;
}

/** Format an ISO timestamp for display, or "" when it is absent or unparsable. */
function formatModified(iso: string): string {
  if (iso === "") return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : new Date(ms).toLocaleString();
}

export function MemoryDetail({
  onBack,
  onSelect,
  onOpen,
  onReveal,
  onDelete,
}: MemoryDetailProps) {
  const memory = selectedMemory.value;
  const titleRef = useRef<HTMLDivElement>(null);

  // Focus follows navigation: opening a detail view moves focus into it so a
  // keyboard user is not left on a row that is no longer rendered.
  useEffect(() => {
    titleRef.current?.focus();
  }, [memory?.id]);

  if (memory === null) {
    // Reached when the host re-pushes a store the selected memory is no
    // longer in — i.e. the user just deleted it. Not an error state.
    return (
      <div class="panel" id="memoryDetailView">
        <BackButton onClick={onBack} label="All memories" />
        <EmptyState
          icon="brain"
          title="That memory is gone"
          description="It was deleted or moved. Go back to the list to see what is left."
        />
      </div>
    );
  }

  const current = store.value;
  const backlinks = backlinksOf(current, memory);
  const indexEntry = indexEntryOf(current, memory);
  const modified = formatModified(memory.meta.modified);
  const project = projectOf(current, memory);

  return (
    <div class="panel" id="memoryDetailView">
      <BackButton onClick={onBack} label="All memories" />

      <div class="d-head">
        <div class="d-title mem-detail-title" tabIndex={-1} ref={titleRef}>
          {memory.meta.name}
        </div>
        {memory.meta.description !== "" ? (
          <div class="d-subtitle">{memory.meta.description}</div>
        ) : null}
        <div class="d-tags">
          {memory.meta.type !== "" && <Badge text={memory.meta.type} />}
          {memory.orphan && (
            <Badge
              text="orphan"
              variant="status"
              title="Nothing links here and MEMORY.md does not list it"
            />
          )}
          {memory.indexed && <Badge text="in MEMORY.md" variant="status" />}
          {!memory.hasFrontmatter && (
            <Badge
              text="no frontmatter"
              variant="status"
              title="The file has no --- block; it is shown as written"
            />
          )}
          {memory.truncated && (
            <Badge
              text="truncated"
              variant="status"
              title="The file is larger than the read bound; links past it are not listed"
            />
          )}
        </div>
      </div>

      <div class="d-actions">
        <Button iconName="external-link" onClick={() => onOpen(memory)}>
          Open File
        </Button>
        <Button iconName="folder" onClick={() => onReveal(memory)}>
          Reveal in file manager
        </Button>
        <Button variant="danger" iconName="trash-2" onClick={() => onDelete(memory)}>
          Delete
        </Button>
      </div>

      <div class="d-section">
        <div class="d-label">Info</div>
        {project !== null ? (
          <div class="d-kv">
            <span class="d-k">Project</span>
            <span class="d-v">{project.label}</span>
          </div>
        ) : null}
        <div class="d-kv">
          <span class="d-k">Path</span>
          <span class="d-v mono" title={memory.path}>
            {memory.path}
          </span>
        </div>
        {modified !== "" ? (
          <div class="d-kv">
            <span class="d-k">Modified</span>
            <span class="d-v">{modified}</span>
          </div>
        ) : null}
        {memory.meta.originSessionId !== "" ? (
          <div class="d-kv">
            <span class="d-k">Session</span>
            <span class="d-v mono" title={memory.meta.originSessionId}>
              {memory.meta.originSessionId}
            </span>
          </div>
        ) : null}
      </div>

      {memory.excerpt !== "" ? (
        <div class="d-section">
          <div class="d-label">Excerpt</div>
          <div class="mem-excerpt">{memory.excerpt}</div>
        </div>
      ) : null}

      <div class="d-section">
        <div class="d-label">Links out ({memory.links.length})</div>
        {memory.links.length === 0 ? (
          <EmptyState
            compact
            title="No outbound links"
            description="This memory references no others."
          />
        ) : (
          <ul class="mem-link-list">
            {memory.links.map((link) => {
              const target = resolveLink(current, memory, link.target);
              return (
                <li key={link.target} class="mem-link">
                  {target === null ? (
                    <span class="mem-link-broken">
                      {link.target}
                      <Badge
                        text="broken"
                        variant="danger"
                        title="No memory in this project declares this name"
                      />
                    </span>
                  ) : (
                    <Button variant="ghost" onClick={() => onSelect(target.id)}>
                      {link.target}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div class="d-section">
        <div class="d-label">Links in ({backlinks.length})</div>
        {backlinks.length === 0 ? (
          <EmptyState
            compact
            title="Nothing links here"
            description={
              memory.indexed
                ? "No other memory links here, but MEMORY.md indexes it."
                : "Nothing links here and MEMORY.md does not index it — this memory is an orphan."
            }
          />
        ) : (
          <ul class="mem-link-list">
            {backlinks.map((source) => (
              <li key={source.id} class="mem-link">
                <Button variant="ghost" onClick={() => onSelect(source.id)}>
                  {source.meta.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {indexEntry !== null ? (
        <div class="d-section">
          <div class="d-label">Index entry</div>
          <div class="text-sm text-muted">
            {indexEntry.title}
            {indexEntry.hook === "" ? "" : ` — ${indexEntry.hook}`}
          </div>
        </div>
      ) : null}
    </div>
  );
}
