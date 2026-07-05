/**
 * MCP feature tab entry. Wires the message bus to the feature signals,
 * requests the server list on mount, and renders either the list or the
 * detail view depending on the current selection. All host sends go through
 * the validated `createMcpApi` wrapper built on the shared `useApi()` hook.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState, ListSkeleton } from "../../../webview/shared/ui";
import type { McpServerInput } from "../../../shared/protocol/messages";
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
import { DetailView, ListView, McpForm } from "./ui";

/** Form state: closed, or open in add (null) / edit (a server) mode. */
type FormState = { open: false } | { open: true; server: McpServer | null };

/** Copy text to the clipboard, ignoring environments without the API. */
function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text);
}

export default function McpTab() {
  const { post } = useApi();
  const api = useMemo(() => createMcpApi(post), [post]);
  const [form, setForm] = useState<FormState>({ open: false });

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

  const submitForm = (originalName: string | null, input: McpServerInput): void => {
    if (originalName !== null) api.update(originalName, input);
    else api.add(input);
    setForm({ open: false });
  };

  // The add/edit form is a full-panel view (not an overlay) — it replaces the
  // list/detail while open, matching the sidebar's single-column flow.
  if (form.open) {
    return (
      <McpForm
        server={form.server}
        existing={servers.value.map((s) => ({ name: s.name, scope: s.scope }))}
        onClose={() => setForm({ open: false })}
        onSubmit={submitForm}
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
        onEdit={(s) => setForm({ open: true, server: s })}
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
      onBrowse={() => api.openUrl(MCP_BROWSE_URL)}
      onRefresh={() => api.getServers()}
      onNew={() => setForm({ open: true, server: null })}
      onReauth={() => api.reconnect()}
    />
  );
}

export { McpTab };
