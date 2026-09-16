/**
 * Plugins tab root. Wires the message bus to the feature signals, asks the
 * host for a snapshot on mount, and renders either the plugin list or the
 * marketplaces/policy view.
 *
 * The list is not virtualized: `enabledPlugins` is hand-maintained and the
 * largest real installation seen has single digits of entries. If that ever
 * changes, `<VirtualList>` is the drop-in — but virtualizing a list of six
 * rows today would cost the expanding "why" text its natural height.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import {
  ContextMenu,
  type ContextMenuItem,
  EmptyState,
  ErrorBanner,
  ListSkeleton,
  ScopeFilter,
  SearchInput,
} from "../../../webview/shared/ui";
import type { PluginEntry, PluginSettingsScope, PluginsData } from "../types";
import { createPluginsApi } from "./api";
import { SCOPE_LABEL, toggleScope } from "./lib";
import {
  applyPluginsData,
  loading,
  type PluginsView,
  parseErrors,
  policy,
  searchQuery,
  view,
  viewCounts,
  visibleMarketplaces,
  visiblePlugins,
} from "./model";
import { MarketplaceItem, PluginItem, PolicyList } from "./ui";

/** Open context menu: the plugin it belongs to and where it was summoned. */
type MenuState = { plugin: PluginEntry; x: number; y: number } | null;

/** Scopes a user can be sent to edit, lowest precedence first. */
const EDITABLE_SCOPES: readonly PluginSettingsScope[] = ["global", "project", "local"] as const;

export default function PluginsTab() {
  const { post } = useApi();
  const api = useMemo(() => createPluginsApi(post), [post]);
  const [menu, setMenu] = useState<MenuState>(null);

  useEffect(() => {
    // The bus hands over a `Message` from the shared protocol union, which
    // does not know `pluginsData` yet — the cast is what the wiring commit
    // removes when the variant lands in `src/shared/protocol/messages.ts`.
    const unsubscribe = registerFeatureHandler("plugins", (msg) => {
      const incoming = msg as unknown as { type: string; data?: PluginsData };
      if (incoming.type !== "pluginsData" || !incoming.data) return;
      applyPluginsData(incoming.data);
    });
    api.getPlugins();
    return unsubscribe;
  }, [api]);

  const counts = viewCounts.value;
  const current = view.value;

  if (loading.value) return <ListSkeleton />;

  const menuItems = (plugin: PluginEntry): ContextMenuItem[] => {
    const target = toggleScope(plugin);
    const items: ContextMenuItem[] = [];
    if (target !== null && plugin.status !== "blocked") {
      items.push({
        label: `${plugin.enabled ? "Disable" : "Enable"} in ${SCOPE_LABEL[target]} settings`,
        icon: plugin.enabled ? "eye-off" : "eye",
        onSelect: () => api.setEnabled(plugin.id, !plugin.enabled, target),
      });
    }
    if (plugin.installed) {
      items.push({
        label: "Open plugin folder",
        icon: "folder",
        onSelect: () => api.openDirectory(plugin.id),
      });
    }
    items.push({
      label: "Copy plugin id",
      icon: "copy",
      onSelect: () => api.copyId(plugin.id),
    });
    // Every settings file, not just the winning one: an override is only
    // fixable from the file that set it, and which file that is has just
    // been shown on the row.
    for (const scope of EDITABLE_SCOPES) {
      items.push({
        label: `Open ${SCOPE_LABEL[scope]} settings.json`,
        icon: "settings",
        separatorBefore: scope === EDITABLE_SCOPES[0],
        onSelect: () => api.openSettings(scope),
      });
    }
    return items;
  };

  const filter = (
    <div class="plg-toolbar">
      <SearchInput
        value={searchQuery.value}
        onInput={(value) => {
          searchQuery.value = value.toLowerCase();
        }}
        placeholder="Search plugins"
        ariaLabel="Search plugins"
      />
      <ScopeFilter<PluginsView>
        value={current}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "issues", label: "Issues", count: counts.issues },
          { value: "sources", label: "Sources", count: counts.sources },
        ]}
        onChange={(next) => {
          view.value = next;
        }}
        ariaLabel="Filter plugins"
      />
    </div>
  );

  if (current === "sources") {
    const list = visibleMarketplaces.value;
    return (
      <div class="plg-tab">
        {filter}
        <ErrorBanner errors={parseErrors.value} />
        <PolicyList entries={policy.value} />
        {list.length === 0 ? (
          <EmptyState
            title="No marketplaces"
            icon="package"
            description="Add one with /plugin marketplace add inside Claude Code."
          />
        ) : (
          <div class="plg-list" role="list">
            {list.map((mkt) => (
              <div role="listitem" key={mkt.name}>
                <MarketplaceItem marketplace={mkt} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const list = visiblePlugins.value;
  return (
    <div class="plg-tab">
      {filter}
      <ErrorBanner errors={parseErrors.value} />
      {list.length === 0 ? (
        <EmptyState
          title={current === "issues" ? "Nothing needs attention" : "No plugins"}
          icon="package"
          description={
            current === "issues"
              ? "Every installed plugin is enabled, and every enabled plugin is installed."
              : "Install one with /plugin inside Claude Code."
          }
        />
      ) : (
        <div class="plg-list" role="list">
          {list.map((plugin) => (
            <div role="listitem" key={plugin.id}>
              <PluginItem
                plugin={plugin}
                onCopyId={(id) => api.copyId(id)}
                onToggle={(p) => {
                  const target = toggleScope(p);
                  if (target !== null) api.setEnabled(p.id, !p.enabled, target);
                }}
                onContextMenu={(p, x, y) => setMenu({ plugin: p, x, y })}
              />
            </div>
          ))}
        </div>
      )}
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        items={menu ? menuItems(menu.plugin) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

export { PluginsTab };
