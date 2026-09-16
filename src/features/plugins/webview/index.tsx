/**
 * Plugins tab root. Wires the message bus to the feature signals, asks the
 * host for a snapshot on mount, registers the tab's command-palette entries,
 * and picks between the list and a plugin's detail view.
 */
import { useEffect, useMemo } from "preact/hooks";
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
import { applyPluginsData, loading, plugins, selectedPlugin } from "./model";
import { DetailView, ListView } from "./ui";

/**
 * Register the bus handler and the palette source. Returns a disposer that
 * removes both. Exported for direct testing without mounting the component.
 */
export function registerPluginsHandlers(): () => void {
  // The bus hands over a `Message` from the shared protocol union, which does
  // not know `pluginsData` yet — the cast is what the wiring commit removes
  // when the variant lands in `src/shared/protocol/messages.ts`.
  const offData = registerFeatureHandler("plugins", (msg) => {
    const incoming = msg as unknown as { type: string; data?: PluginsData };
    if (incoming.type !== "pluginsData" || !incoming.data) return;
    applyPluginsData(incoming.data);
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

  useEffect(() => {
    const dispose = registerPluginsHandlers();
    api.getPlugins();
    return dispose;
  }, [api]);

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

  return <ListView api={api} />;
}

export { PluginsTab };
