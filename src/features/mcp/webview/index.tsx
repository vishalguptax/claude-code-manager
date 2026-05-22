/**
 * MCP feature tab entry. Wires the message bus to the feature signals,
 * requests the server list on mount, and renders either the list or the
 * detail view depending on the current selection. All host sends go through
 * the validated `createMcpApi` wrapper built on the shared `useApi()` hook.
 */
import { useEffect, useMemo } from "preact/hooks";
import { EmptyState } from "../../../webview/components/EmptyState";
import { Loading } from "../../../webview/components/Loading";
import { useApi } from "../../../webview/hooks/useApi";
import { registerFeatureHandler } from "../../../webview/signals/messageBus";
import type { McpServer } from "../types";
import { createMcpApi } from "./api";
import { applyError, applyServers, errorMessage, loading, selected, servers } from "./signals";
import { DetailView } from "./views/DetailView";
import { ListView } from "./views/ListView";

/**
 * Default community MCP directory. The v1 host could override this from
 * settings, but that plumbing lives in the sessions monolith; until F3
 * rewires it, the tab opens the default directory.
 */
const MCP_BROWSE_URL = "https://mcp.so";

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
        applyServers((msg.data ?? []) as McpServer[]);
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
    return <Loading />;
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
        onOpenConfig={(s) => api.openConfig(s.scope)}
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
