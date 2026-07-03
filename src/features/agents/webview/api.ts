/**
 * Typed postMessage senders for the agents feature. Wraps the shared
 * `useApi()` bridge so callers never construct raw message objects and every
 * payload is checked against the `WebviewMessage` union at compile time.
 */
import type { AgentInput, WebviewMessage } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";

export interface AgentsApi {
  /** Ask the host to (re)send the full agent list. */
  getAgents(): void;
  /** Ask the host to open an agent's .md file in the editor. */
  openAgentFile(path: string): void;
  /** Create a new agent from the form payload. */
  createAgent(agent: AgentInput): void;
  /** Rewrite an existing agent file in place. */
  updateAgent(path: string, agent: AgentInput): void;
  /** Delete an agent file (host shows a confirm modal). */
  deleteAgent(path: string): void;
  /** Duplicate an agent to <name>-copy.md. */
  duplicateAgent(path: string): void;
}

/**
 * Hook returning the agents message senders bound to the host bridge.
 * The `satisfies WebviewMessage` assertions guarantee the literals stay in
 * sync with the shared protocol.
 */
export function useAgentsApi(): AgentsApi {
  const { post } = useApi();
  return {
    getAgents() {
      post({ type: "getAgents" } satisfies WebviewMessage);
    },
    openAgentFile(path: string) {
      post({ type: "openAgentFile", path } satisfies WebviewMessage);
    },
    createAgent(agent: AgentInput) {
      post({ type: "createAgent", agent } satisfies WebviewMessage);
    },
    updateAgent(path: string, agent: AgentInput) {
      post({ type: "updateAgent", path, agent } satisfies WebviewMessage);
    },
    deleteAgent(path: string) {
      post({ type: "deleteAgent", path } satisfies WebviewMessage);
    },
    duplicateAgent(path: string) {
      post({ type: "duplicateAgent", path } satisfies WebviewMessage);
    },
  };
}
