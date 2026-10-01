/**
 * Browse view: every plugin the marketplaces Claude Code has added offer,
 * grouped by marketplace, searchable.
 *
 * Nothing here is fetched — the host reads each marketplace's catalog from
 * the clone Claude Code keeps on disk — so the subtitle says where the list
 * comes from, and the empty state says how to widen it.
 *
 * The official marketplace alone lists hundreds of plugins, so past
 * {@link VIRTUAL_THRESHOLD} rows the list windows through the shared
 * VirtualList, with the marketplace headings interleaved as rows.
 */
import {
  BackButton,
  EmptyState,
  SearchInput,
  VirtualList,
} from "../../../../../webview/shared/ui";
import type { AvailablePlugin } from "../../../types";
import { buildCatalogRows, type CatalogRow } from "../../lib";
import { available, catalogQuery, visibleAvailable } from "../../model";
import { AvailableItem } from "../AvailableItem";

/** Rows above which the list windows. The MCP list uses the same bar. */
const VIRTUAL_THRESHOLD = 50;
/**
 * Pre-measure estimate for a row (px): name plus a two-line description.
 * VirtualList measures every rendered row, so this only seeds the scrollbar.
 */
const ROW_ESTIMATE = 76;

export interface PluginCatalogProps {
  onBack: () => void;
  onSelect: (plugin: AvailablePlugin) => void;
}

export function PluginCatalog({ onBack, onSelect }: PluginCatalogProps) {
  const total = available.value.length;
  const list = visibleAvailable.value;
  const rows = buildCatalogRows(list);

  const renderRow = (row: CatalogRow) =>
    row.kind === "label" ? (
      <div class="group-label" key={`label:${row.marketplace}`}>
        {row.marketplace}
      </div>
    ) : (
      <AvailableItem key={row.plugin.id} plugin={row.plugin} onSelect={onSelect} />
    );

  let body;
  if (total === 0) {
    body = (
      <EmptyState
        icon="package"
        title="No marketplaces to browse"
        description={
          <>
            Add one with <code>/plugin marketplace add</code> inside Claude Code, and its plugins
            appear here.
          </>
        }
      />
    );
  } else if (list.length === 0) {
    body = <EmptyState title="No matching plugins" />;
  } else {
    body = (
      <>
        <div class="list-count">
          {list.length} plugin{list.length === 1 ? "" : "s"}
        </div>
        {list.length > VIRTUAL_THRESHOLD ? (
          <VirtualList<CatalogRow>
            label="Available plugins"
            items={rows}
            itemHeight={ROW_ESTIMATE}
            renderItem={renderRow}
          />
        ) : (
          rows.map(renderRow)
        )}
      </>
    );
  }

  return (
    <div class="panel" id="pluginsCatalogView">
      <BackButton onClick={onBack} label="Plugins" />
      <div class="d-head">
        <div class="d-title">Browse plugins</div>
        <div class="d-subtitle">
          From the marketplaces Claude Code has added. Skills ship as plugins too.
        </div>
      </div>
      {total === 0 ? null : (
        <div class="search-row">
          <SearchInput
            value={catalogQuery.value}
            onInput={(value) => {
              catalogQuery.value = value;
            }}
            placeholder="Search plugins"
            ariaLabel="Search available plugins"
          />
        </div>
      )}
      <div class="list">{body}</div>
    </div>
  );
}
