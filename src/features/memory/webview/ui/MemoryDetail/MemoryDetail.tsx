/**
 * One memory's detail view: its frontmatter, its excerpt, the graph around it
 * (outbound links, backlinks, index entry) and the three actions the host
 * offers.
 *
 * The graph is the point. A list row can say "2 broken links"; only here can
 * the user see WHICH slugs resolve to nothing, and which other memories would
 * be orphaned by deleting this one. Delete is deliberately last and the host
 * owns its confirmation, so this component never learns enough to skip it.
 */
import { useEffect, useRef } from "preact/hooks";
import {
  BackButton,
  Badge,
  Button,
  EmptyState,
} from "../../../../../webview/shared/ui";
import type { MemoryFile } from "../../../types";
import { backlinksOf, indexEntryOf, resolveLink } from "../../lib";
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
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus follows navigation: opening a detail view moves focus into it so a
  // keyboard user is not left on a row that is no longer rendered.
  useEffect(() => {
    headingRef.current?.focus();
  }, [memory?.id]);

  if (memory === null) {
    // Reached when the host re-pushes a store the selected memory is no
    // longer in — i.e. the user just deleted it. Not an error state.
    return (
      <div class="mem-detail">
        <BackButton onClick={onBack} label="All memories" />
        <EmptyState
          icon="package"
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

  return (
    <div class="mem-detail">
      <BackButton onClick={onBack} label="All memories" />

      <h2 class="mem-detail-title" tabIndex={-1} ref={headingRef}>
        {memory.meta.name}
      </h2>

      <div class="mem-detail-chips">
        {memory.meta.type !== "" && <Badge text={memory.meta.type} variant="default" />}
        {memory.orphan && (
          <Badge
            text="orphan"
            variant="status"
            title="Nothing links here and MEMORY.md does not list it"
          />
        )}
        {memory.indexed && <Badge text="in MEMORY.md" variant="status" />}
        {!memory.hasFrontmatter && <Badge text="no frontmatter" variant="status" />}
        {memory.truncated && (
          <Badge
            text="truncated"
            variant="status"
            title="The file is larger than the read bound; links past it are not listed"
          />
        )}
      </div>

      {memory.meta.description !== "" && (
        <p class="mem-detail-desc">{memory.meta.description}</p>
      )}

      {memory.excerpt !== "" && <p class="mem-detail-excerpt">{memory.excerpt}</p>}

      <dl class="mem-detail-facts">
        <dt>File</dt>
        <dd class="mem-detail-path">{memory.path}</dd>
        {modified !== "" && (
          <>
            <dt>Modified</dt>
            <dd>{modified}</dd>
          </>
        )}
        {memory.meta.originSessionId !== "" && (
          <>
            <dt>Written by session</dt>
            <dd class="mem-detail-session">{memory.meta.originSessionId}</dd>
          </>
        )}
      </dl>

      <section class="mem-detail-section">
        <h3 class="mem-detail-heading">Links out ({memory.links.length})</h3>
        {memory.links.length === 0 ? (
          <p class="mem-detail-none">This memory references no others.</p>
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
      </section>

      <section class="mem-detail-section">
        <h3 class="mem-detail-heading">Links in ({backlinks.length})</h3>
        {backlinks.length === 0 ? (
          <p class="mem-detail-none">
            {memory.indexed
              ? "No other memory links here, but MEMORY.md indexes it."
              : "Nothing links here and MEMORY.md does not index it — this memory is an orphan."}
          </p>
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
      </section>

      {indexEntry !== null && (
        <section class="mem-detail-section">
          <h3 class="mem-detail-heading">Index entry</h3>
          <p class="mem-detail-none">
            {indexEntry.title}
            {indexEntry.hook === "" ? "" : ` — ${indexEntry.hook}`}
          </p>
        </section>
      )}

      <div class="mem-detail-actions">
        <Button iconName="external-link" label="Open" onClick={() => onOpen(memory)} />
        <Button
          variant="ghost"
          iconName="folder"
          label="Reveal in file manager"
          onClick={() => onReveal(memory)}
        />
        <Button
          variant="danger"
          iconName="trash-2"
          label="Delete"
          onClick={() => onDelete(memory)}
        />
      </div>
    </div>
  );
}
