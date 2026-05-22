/**
 * Typed postMessage senders for the agents feature. Wraps the shared
 * `useApi()` bridge so callers never construct raw message objects and every
 * payload is checked against the `WebviewMessage` union at compile time.
 */
import type { WebviewMessage } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/hooks/useApi";

export interface AgentsApi {
  /** Ask the host to (re)send the full agent list. */
  getAgents(): void;
  /** Ask the host to open an agent's .md file in the editor. */
  openAgentFile(path: string): void;
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
  };
}
