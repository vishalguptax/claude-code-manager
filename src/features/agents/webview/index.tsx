/**
 * Agents feature entry point. Mounted by the shell's `TabPanel` when the
 * Agents tab activates. Owns inbound-message wiring (via the shared message
 * bus), the initial data request, switching between list and detail views,
 * and the create/edit form modal.
 */
import { useEffect, useState } from "preact/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { AgentInput } from "../../../shared/protocol/messages";
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
import { AgentDetailView, AgentForm, AgentListView } from "./ui";

/** Form state: closed, or open in create (null) / edit (an Agent) mode. */
type FormState = { open: false } | { open: true; agent: Agent | null };

export default function AgentsTab() {
  const api = useAgentsApi();
  const [form, setForm] = useState<FormState>({ open: false });

  useEffect(() => {
    // Route host messages for this feature into the signals. The bus parses
    // and validates payloads with valibot before invoking this handler.
    const off = registerFeatureHandler("agents", (msg) => {
      if (msg.type === "agents") {
        setAgents((msg.data as Agent[]) ?? [], msg.errors ?? []);
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

  const submitForm = (input: AgentInput): void => {
    if (form.open && form.agent) {
      api.updateAgent(form.agent.path, input);
    } else {
      api.createAgent(input);
    }
    setForm({ open: false });
  };

  // The create/edit form is a full-panel view (not an overlay) — it replaces
  // the list/detail while open, matching the sidebar's single-column flow.
  if (form.open) {
    return (
      <AgentForm agent={form.agent} onClose={() => setForm({ open: false })} onSubmit={submitForm} />
    );
  }

  const selected = selectedAgent.value;
  if (selected) {
    return (
      <AgentDetailView
        agent={selected}
        onBack={() => selectAgent(null)}
        onOpenFile={api.openAgentFile}
        onEdit={(a) => setForm({ open: true, agent: a })}
        onDuplicate={(a) => api.duplicateAgent(a.path)}
        onDelete={(a) => api.deleteAgent(a.path)}
      />
    );
  }

  return (
    <AgentListView onRefresh={api.getAgents} onNew={() => setForm({ open: true, agent: null })} />
  );
}
