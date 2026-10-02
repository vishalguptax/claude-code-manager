/**
 * Plugins tab root. Wires the message bus to the feature signals, asks the
 * host for a snapshot on mount, registers the tab's command-palette entries,
 * and picks between the list, a plugin's detail view, and the Browse view of
 * plugins to install (with its own per-plugin install view).
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import {
  activeTab,
  registerFeatureHandler,
  registerPaletteSource,
} from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { PluginEntry, PluginsData } from "../types";
import { createPluginsApi } from "./api";
import { STATUS_LABEL, toggleScope } from "./lib";
import { applyPluginsData, available, loading, plugins, selectedPlugin } from "./model";
import { AvailableDetail, DetailView, ListView, PluginCatalog } from "./ui";

/**
 * The Browse views, layered over the list. An install view holds the id
 * rather than the entry, so each fresh host snapshot — the one that lands
 * after an install finishes — re-resolves it and the view flips to its
 * installed state without any extra wiring.
 */
type BrowseState = { kind: "closed" } | { kind: "catalog" } | { kind: "plugin"; id: string };

/**
 * Register the bus handler and the palette source. Returns a disposer that
 * removes both. Exported for direct testing without mounting the component.
 */
export function registerPluginsHandlers(): () => void {
  // The protocol carries the snapshot as `data: unknown` so the shared union
  // stays free of feature types; this feature owns the shape and narrows it.
  const offData = registerFeatureHandler("plugins", (msg) => {
    if (msg.type !== "pluginsData" || !msg.data) return;
    applyPluginsData(msg.data as PluginsData);
  });

  // Plugins in the command palette. The source is called per query, so it
  // always reads the live signal without this module subscribing to it. The
  // "plugins" id is the feature's own message prefix, so it cannot collide
  // with another feature's registration.
  const offPalette = registerPaletteSource("plugins", () =>
    plugins.value.map((p) => ({
      id: `plugins:${p.id}`,
      title: p.name,
      subtitle: p.marketplace,
      group: "Plugins",
      icon: "package",
      hint: STATUS_LABEL[p.status],
      run: () => {
        activeTab.value = "plugins";
        selectedPlugin.value = p;
      },
    })),
  );

  return () => {
    offData();
    offPalette();
  };
}

export default function PluginsTab() {
  const { post } = useApi();
  const api = useMemo(() => createPluginsApi(post), [post]);
  const [browse, setBrowse] = useState<BrowseState>({ kind: "closed" });

  useEffect(() => {
    const dispose = registerPluginsHandlers();
    api.getPlugins();
    return dispose;
  }, [api]);

  if (browse.kind === "plugin") {
    const entry = available.value.find((p) => p.id === browse.id);
    // Gone from every catalog (the marketplace was removed or refreshed
    // without it): there is nothing left to show, so fall back to the list
    // it was opened from.
    if (entry) {
      return (
        <AvailableDetail
          plugin={entry}
          onBack={() => setBrowse({ kind: "catalog" })}
          onInstall={(id, scope) => api.install(id, scope)}
          onShowInstalled={(id) => {
            selectedPlugin.value = plugins.value.find((p) => p.id === id) ?? null;
            setBrowse({ kind: "closed" });
          }}
          onOpenUrl={(url) => api.openUrl(url)}
          onCopyId={(id) => api.copyId(id)}
        />
      );
    }
  }

  if (browse.kind !== "closed") {
    return (
      <PluginCatalog
        onBack={() => setBrowse({ kind: "closed" })}
        onSelect={(p) => setBrowse({ kind: "plugin", id: p.id })}
      />
    );
  }

  const selected = selectedPlugin.value;
  if (selected) {
    return (
      <DetailView
        plugin={selected}
        onBack={() => {
          selectedPlugin.value = null;
        }}
        onToggle={(plugin: PluginEntry) => {
          const target = toggleScope(plugin);
          if (target !== null) api.setEnabled(plugin.id, !plugin.enabled, target);
        }}
        onOpenDirectory={(id) => api.openDirectory(id)}
        onCopyId={(id) => api.copyId(id)}
        onOpenSettings={(scope) => api.openSettings(scope)}
      />
    );
  }

  // Before the host's first snapshot, show the content-shaped <ListSkeleton />
  // (search row + filter + rows) rather than the list's own empty state.
  if (loading.value) return <ListSkeleton />;

  return <ListView api={api} onBrowse={() => setBrowse({ kind: "catalog" })} />;
}

export { PluginsTab };
