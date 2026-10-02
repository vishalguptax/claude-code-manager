/**
 * MCP feature tab entry. Wires the message bus to the feature signals,
 * requests the server list on mount, and renders either the list or the
 * detail view depending on the current selection. All host sends go through
 * the validated `createMcpApi` wrapper built on the shared `useApi()` hook.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import type { McpServerInput } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";
import {
  activeTab,
  marketplaceMcpUrl,
  registerFeatureHandler,
  registerPaletteSource,
} from "../../../webview/shared/model";
import { EmptyState, ListSkeleton } from "../../../webview/shared/ui";
import type { McpServer } from "../types";
import { createMcpApi } from "./api";
import { catalogPreset, configuredNames, type McpFormPreset } from "./lib";
import {
  applyAuthNeeds,
  applyError,
  applyServers,
  errorMessage,
  filteredServers,
  loading,
  selected,
  servers,
} from "./model";
import { DetailView, ListView, McpCatalog, McpForm } from "./ui";

/**
 * Which full-panel view replaces the list. The form remembers where it was
 * opened from, so Back from a catalog preset returns to the catalog.
 */
type Overlay =
  | { kind: "none" }
  | { kind: "catalog" }
  | {
      kind: "form";
      /** The server being edited, or null to add one. */
      server: McpServer | null;
      preset?: McpFormPreset;
      fromCatalog: boolean;
    };

/** Copy text to the clipboard, ignoring environments without the API. */
function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text);
}

export default function McpTab() {
  const { post } = useApi();
  const api = useMemo(() => createMcpApi(post), [post]);
  const [overlay, setOverlay] = useState<Overlay>({ kind: "none" });
  const close = (): void => setOverlay({ kind: "none" });
  const openForm = (server: McpServer | null): void =>
    setOverlay({ kind: "form", server, fromCatalog: false });

  useEffect(() => {
    const unsubscribe = registerFeatureHandler("mcp", (msg) => {
      if (msg.type === "mcpServers") {
        // The host now sends { servers, authNeeds } so the auth-health
        // badge can live on the MCP tab. Older builds (or test fixtures)
        // may still emit a bare array — handle both shapes.
        const errors = msg.errors ?? [];
        const data = msg.data as unknown;
        if (Array.isArray(data)) {
          applyServers(data as McpServer[], errors);
          applyAuthNeeds([]);
        } else if (data && typeof data === "object") {
          const d = data as { servers?: McpServer[]; authNeeds?: string[] };
          applyServers((d.servers ?? []) as McpServer[], errors);
          applyAuthNeeds(d.authNeeds ?? []);
        } else {
          applyServers([], errors);
          applyAuthNeeds([]);
        }
      }
    });
    const unsubscribeError = registerFeatureHandler("error", (msg) => {
      if (msg.type === "error") applyError(msg.message);
    });
    api.getServers();

    // MCP servers in the command palette. The source is called per query, so
    // it always reads the live signal without this module subscribing to it.
    const offPalette = registerPaletteSource("mcp", () =>
      servers.value.map((s) => ({
        id: `mcp:${s.name}`,
        title: s.name,
        subtitle: s.type,
        group: "MCP servers",
        icon: "plug",
        hint: s.scope,
        run: () => {
          activeTab.value = "mcp";
          selected.value = s;
        },
      })),
    );
    return () => {
      unsubscribe();
      unsubscribeError();
      offPalette();
    };
  }, [api]);

  const sel = selected.value;
  const err = errorMessage.value;

  if (loading.value && sel === null) {
    return <ListSkeleton />;
  }

  // A host error with no data loaded replaces the view; once servers exist we
  // keep showing them (a failed refresh should not blank a populated list).
  if (err && servers.value.length === 0 && sel === null) {
    return <EmptyState title="Failed to load MCP servers" description={err} />;
  }

  const onSelect = (server: McpServer) => {
    selected.value = server;
  };

  const submitForm = (originalName: string | null, input: McpServerInput): void => {
    if (originalName !== null) api.update(originalName, input);
    else api.add(input);
    close();
  };

  // The form and the catalog are full-panel views (not overlays) — each
  // replaces the list/detail while open, matching the sidebar's
  // single-column flow.
  if (overlay.kind === "form") {
    return (
      <McpForm
        server={overlay.server}
        preset={overlay.preset}
        existing={servers.value.map((s) => ({ name: s.name, scope: s.scope }))}
        onClose={() => setOverlay(overlay.fromCatalog ? { kind: "catalog" } : { kind: "none" })}
        onSubmit={submitForm}
      />
    );
  }

  if (overlay.kind === "catalog") {
    return (
      <McpCatalog
        configured={configuredNames(servers.value)}
        onBack={close}
        onAdd={(entry) =>
          setOverlay({
            kind: "form",
            server: null,
            preset: catalogPreset(entry),
            fromCatalog: true,
          })
        }
        onOpenExisting={(name) => {
          // The list's own order (project, local, global) decides which
          // entry opens when the name is configured in several scopes.
          selected.value = filteredServers.value.find((s) => s.name === name) ?? null;
          close();
        }}
        onOpenUrl={(url) => api.openUrl(url)}
        onBrowseMore={() => api.openUrl(marketplaceMcpUrl.value)}
      />
    );
  }

  if (sel) {
    return (
      <DetailView
        server={sel}
        onBack={() => {
          selected.value = null;
        }}
        onEdit={(s) => openForm(s)}
        onOpenConfig={(s) => api.openConfig(s.scope, s.name)}
        onToggle={(s) => api.toggle(s.name, s.scope, !s.disabled, s.pluginName)}
        onDelete={(s) => api.remove(s.name, s.scope)}
        onCopyName={copyToClipboard}
        onOpenClaude={() => api.newSession()}
        onAuthenticate={(name) => api.authenticate(name)}
        onLogout={(name) => api.logout(name)}
        onReconnect={() => api.reconnect()}
        onCheckStatus={() => api.checkStatus()}
      />
    );
  }

  return (
    <ListView
      onSelect={onSelect}
      onCopyName={copyToClipboard}
      onOpenCatalog={() => setOverlay({ kind: "catalog" })}
      onRefresh={() => api.getServers()}
      onNew={() => openForm(null)}
      onReauth={() => api.reconnect()}
      // Same actions the detail view offers, one right-click away, so a
      // server can be switched off without opening it first.
      menu={{
        onEdit: (s) => openForm(s),
        onToggle: (s) => api.toggle(s.name, s.scope, !s.disabled, s.pluginName),
        onDelete: (s) => api.remove(s.name, s.scope),
        onCopyName: copyToClipboard,
        onOpenConfig: (s) => api.openConfig(s.scope, s.name),
        onAuthenticate: (name) => api.authenticate(name),
        onLogout: (name) => api.logout(name),
      }}
    />
  );
}

export { McpTab };
