/**
 * Typed webview → host senders for the Plugins tab.
 *
 * Other features run each outgoing message through `parseMessage` from the
 * shared valibot schema so a shape drift fails loudly in tests. These
 * variants are not in that schema yet, so calling it here would reject every
 * send. The message shapes are instead pinned by `PluginsWebviewMessage` at
 * compile time, and `send` is the single line that becomes
 * `post(parseMessage(msg))` once the variants land in
 * `src/shared/protocol/messages.ts` and `schemas.ts`.
 */
import type { PluginSettingsScope, PluginsWebviewMessage } from "../types";

/** The Plugins tab's outgoing surface. */
export interface PluginsApi {
  getPlugins(): void;
  openDirectory(id: string): void;
  openSettings(scope: PluginSettingsScope): void;
  copyId(id: string): void;
  setEnabled(id: string, enabled: boolean, scope: PluginSettingsScope): void;
}

function send(post: (m: unknown) => void, msg: PluginsWebviewMessage): void {
  post(msg);
}

/** Wrap the raw `post` from `useApi()` in Plugins-specific typed senders. */
export function createPluginsApi(post: (m: unknown) => void): PluginsApi {
  return {
    getPlugins() {
      send(post, { type: "getPlugins" });
    },
    openDirectory(id) {
      send(post, { type: "openPluginDirectory", id });
    },
    openSettings(scope) {
      send(post, { type: "openPluginSettings", scope });
    },
    copyId(id) {
      send(post, { type: "copyPluginId", id });
    },
    setEnabled(id, enabled, scope) {
      send(post, { type: "setPluginEnabled", id, enabled, scope });
    },
  };
}
