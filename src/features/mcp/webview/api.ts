/**
 * Typed webview → host message senders for the MCP feature.
 *
 * Every send is validated against the shared protocol schema before it
 * leaves the webview, so a malformed message fails loudly in tests and dev
 * rather than silently reaching the host. Callers pass plain arguments; this
 * module owns the message shapes (single source: shared protocol).
 */
import { parseMessage } from "../../../shared/protocol/schemas";
import type { WebviewMessage } from "../../../shared/protocol/messages";
import type { McpServerScope } from "../types";

/** Bridge shape returned by the shared `useApi()` hook. */
export interface McpApi {
  getServers(): void;
  openConfig(scope: McpServerScope, name?: string): void;
  toggle(name: string, scope: McpServerScope, disabled: boolean, pluginName?: string): void;
  remove(name: string, scope: McpServerScope): void;
  openUrl(url: string): void;
  newSession(): void;
}

/** Validate then post a webview message via the host bridge. */
function send(post: (m: unknown) => void, msg: WebviewMessage): void {
  // parseMessage throws on shape drift — surfaces bugs in tests/dev instead
  // of shipping a malformed message the host will silently drop.
  post(parseMessage(msg));
}

/**
 * Wrap the raw `post` from `useApi()` in MCP-specific typed senders.
 */
export function createMcpApi(post: (m: unknown) => void): McpApi {
  return {
    getServers() {
      send(post, { type: "getMcpServers" });
    },
    openConfig(scope, name) {
      send(post, { type: "openMcpConfig", scope, name });
    },
    toggle(name, scope, disabled, pluginName) {
      send(post, { type: "toggleMcpServer", name, scope, disabled, pluginName });
    },
    remove(name, scope) {
      send(post, { type: "deleteMcpServer", name, scope });
    },
    openUrl(url) {
      send(post, { type: "openUrl", url });
    },
    newSession() {
      send(post, { type: "newSession" });
    },
  };
}
