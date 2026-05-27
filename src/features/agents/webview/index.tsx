/**
 * Agents feature entry point. Mounted by the shell's `TabPanel` when the
 * Agents tab activates. Owns inbound-message wiring (via the shared message
 * bus), the initial data request, and switching between list and detail views.
 */
import { useEffect } from "preact/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { Agent } from "../types";
import { useAgentsApi } from "./api";
import {
  error,
  loading,
  resetAgentsState,
  selectAgent,
  selectedAgent,
  setAgents,
  setError,
} from "./model";
import { AgentDetailView, AgentListView } from "./ui";

export default function AgentsTab() {
  const api = useAgentsApi();

  useEffect(() => {
    // Route host messages for this feature into the signals. The bus parses
    // and validates payloads with valibot before invoking this handler.
    const off = registerFeatureHandler("agents", (msg) => {
      if (msg.type === "agents") {
        setAgents((msg.data as Agent[]) ?? []);
      }
    });
    const offError = registerFeatureHandler("error", (msg) => {
      if (msg.type === "error") setError(msg.message);
    });

    api.getAgents();

    return () => {
      off();
      offError();
      resetAgentsState();
    };
    // Mount-once: register handlers, request data, tear down on unmount.
  }, []);

  if (error.value) {
    return <div class="empty">Error: {error.value}</div>;
  }

  if (loading.value) {
    return <ListSkeleton />;
  }

  const selected = selectedAgent.value;
  if (selected) {
    return (
      <AgentDetailView
        agent={selected}
        onBack={() => selectAgent(null)}
        onOpenFile={api.openAgentFile}
      />
    );
  }

  return <AgentListView onRefresh={api.getAgents} />;
}
