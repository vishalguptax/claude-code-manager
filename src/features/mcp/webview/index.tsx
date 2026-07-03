/**
 * MCP feature tab entry. Wires the message bus to the feature signals,
 * requests the server list on mount, and renders either the list or the
 * detail view depending on the current selection. All host sends go through
 * the validated `createMcpApi` wrapper built on the shared `useApi()` hook.
 */
import { useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState, ListSkeleton } from "../../../webview/shared/ui";
import type { McpServer } from "../types";
import { createMcpApi } from "./api";
import { MCP_BROWSE_URL } from "./lib";
import {
  applyAuthNeeds,
  applyError,
  applyServers,
  errorMessage,
  loading,
  selected,
  servers,
} from "./model";
import { DetailView, ListView } from "./ui";

/** Copy text to the clipboard, ignoring environments without the API. */
function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text);
}

export default function McpTab() {
  const { post } = useApi();
  const api = useMemo(() => createMcpApi(post), [post]);

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
    return () => {
      unsubscribe();
      unsubscribeError();
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

  if (sel) {
    return (
      <DetailView
        server={sel}
        onBack={() => {
          selected.value = null;
        }}
        onOpenConfig={(s) => api.openConfig(s.scope, s.name)}
        onToggle={(s) => api.toggle(s.name, s.scope, !s.disabled, s.pluginName)}
        onDelete={(s) => api.remove(s.name, s.scope)}
        onCopyName={copyToClipboard}
        onOpenClaude={() => api.newSession()}
      />
    );
  }

  return (
    <ListView
      onSelect={onSelect}
      onCopyName={copyToClipboard}
      onBrowse={() => api.openUrl(MCP_BROWSE_URL)}
      onRefresh={() => api.getServers()}
    />
  );
}

export { McpTab };
