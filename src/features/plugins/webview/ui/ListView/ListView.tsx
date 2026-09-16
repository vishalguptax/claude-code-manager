/**
 * Plugins list view: the search row, the All / Issues / Sources segments, and
 * whichever list the active segment names.
 *
 * Same shell as every other tab — a `.panel` root that owns its scroll, a
 * `.search-row` inset to the list's own text inset, a shared segmented
 * control under it, and a `.list` body with a `.list-count` caption.
 *
 * The list is not virtualized: `enabledPlugins` is hand-maintained and the
 * largest real installation seen has single digits of entries. If that ever
 * changes, `<VirtualList>` is the drop-in — but virtualizing a list of six
 * rows today would cost the wrapping "why" line its natural height.
 */
import { useState } from "preact/hooks";
import {
  Button,
  ContextMenu,
  EmptyState,
  ErrorBanner,
  SearchInput,
  Segmented,
} from "../../../../../webview/shared/ui";
import type { PluginEntry } from "../../../types";
import type { PluginsApi } from "../../api";
import { buildPluginMenu, toggleScope } from "../../lib";
import {
  parseErrors,
  policy,
  type PluginsView,
  searchQuery,
  selectedPlugin,
  view,
  viewCounts,
  visibleMarketplaces,
  visiblePlugins,
} from "../../model";
import { MarketplaceItem } from "../MarketplaceItem";
import { PluginItem } from "../PluginItem";
import { PolicyList } from "../PolicyList";

/** Open context menu: the plugin it belongs to and where it was summoned. */
type MenuState = { plugin: PluginEntry; x: number; y: number } | null;

export interface ListViewProps {
  api: PluginsApi;
}

export function ListView({ api }: ListViewProps) {
  const [menu, setMenu] = useState<MenuState>(null);
  const counts = viewCounts.value;
  const current = view.value;
  const selectedId = selectedPlugin.value?.id;

  const toggle = (plugin: PluginEntry): void => {
    const target = toggleScope(plugin);
    if (target !== null) api.setEnabled(plugin.id, !plugin.enabled, target);
  };

  const handlers = {
    onToggle: toggle,
    onOpenDirectory: (id: string) => api.openDirectory(id),
    onCopyId: (id: string) => api.copyId(id),
    onOpenSettings: api.openSettings,
  };

  return (
    <div class="panel" id="pluginsListView">
      <ErrorBanner errors={parseErrors.value} />

      <div class="search-row">
        <SearchInput
          value={searchQuery.value}
          onInput={(value) => {
            searchQuery.value = value.toLowerCase();
          }}
          placeholder="Search"
          ariaLabel="Search plugins"
        />
        <Button
          variant="icon"
          class="search-side-btn"
          iconName="refresh-cw"
          title="Refresh plugins"
          ariaLabel="Refresh plugins"
          onClick={() => api.getPlugins()}
        />
      </div>

      {/* Three short labels with single-digit counts fit the sidebar, so the
          counts stay on the segments rather than hiding in a tooltip. The
          shared `.scope-filter` class is what insets every other tab's filter
          row to match the search field above it. */}
      <Segmented<PluginsView>
        class="scope-filter"
        value={current}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "issues", label: "Issues", count: counts.issues },
          { value: "sources", label: "Sources", count: counts.sources },
        ]}
        onChange={(next) => {
          view.value = next;
        }}
        ariaLabel="Plugins view"
      />

      {current === "sources" ? (
        <SourcesBody />
      ) : (
        <div class="list">
          <PluginsBody
            list={visiblePlugins.value}
            view={current}
            selectedId={selectedId}
            onSelect={(plugin) => {
              selectedPlugin.value = plugin;
            }}
            onCopyId={handlers.onCopyId}
            onToggle={toggle}
            onContextMenu={(plugin, x, y) => setMenu({ plugin, x, y })}
          />
        </div>
      )}

      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? buildPluginMenu(menu.plugin, handlers) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

interface PluginsBodyProps {
  list: PluginEntry[];
  view: PluginsView;
  selectedId: string | undefined;
  onSelect: (plugin: PluginEntry) => void;
  onCopyId: (id: string) => void;
  onToggle: (plugin: PluginEntry) => void;
  onContextMenu: (plugin: PluginEntry, x: number, y: number) => void;
}

function PluginsBody({
  list,
  view: current,
  selectedId,
  onSelect,
  onCopyId,
  onToggle,
  onContextMenu,
}: PluginsBodyProps) {
  if (list.length === 0) {
    return current === "issues" ? (
      <EmptyState
        icon="check"
        title="Nothing needs attention"
        description="Every installed plugin is enabled, and every enabled plugin is installed."
      />
    ) : (
      <EmptyState
        icon="package"
        title="No plugins"
        description={
          <>
            Install one with <code>/plugin</code> inside Claude Code.
          </>
        }
      />
    );
  }

  return (
    <>
      <div class="list-count">
        {list.length} plugin{list.length === 1 ? "" : "s"}
      </div>
      {list.map((plugin) => (
        <PluginItem
          key={plugin.id}
          plugin={plugin}
          active={selectedId === plugin.id}
          onSelect={onSelect}
          onCopyId={onCopyId}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

/** Marketplaces plus the plugin-related settings keys that govern them. */
function SourcesBody() {
  const list = visibleMarketplaces.value;
  const keys = policy.value;
  return (
    <div class="list">
      {keys.length === 0 ? null : (
        <>
          <div class="group-label">Policy</div>
          <PolicyList entries={keys} />
        </>
      )}
      {list.length === 0 ? (
        <EmptyState
          icon="globe"
          title="No marketplaces"
          description={
            <>
              Add one with <code>/plugin marketplace add</code> inside Claude Code.
            </>
          }
        />
      ) : (
        <>
          <div class="group-label">Marketplaces</div>
          <div class="list-count">
            {list.length} marketplace{list.length === 1 ? "" : "s"}
          </div>
          {list.map((mkt) => (
            <MarketplaceItem key={mkt.name} marketplace={mkt} />
          ))}
        </>
      )}
    </div>
  );
}
