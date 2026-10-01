/**
 * Typed webview → host senders for the Plugins tab.
 *
 * Every send is validated against the shared protocol schema before it
 * leaves the webview, so a malformed message fails loudly in tests and dev
 * rather than silently reaching the host. Callers pass plain arguments; this
 * module owns the message shapes.
 */
import type { WebviewMessage } from "../../../shared/protocol/messages";
import { parseMessage } from "../../../shared/protocol/schemas";
import type { PluginInstallScope, PluginSettingsScope } from "../types";

/** The Plugins tab's outgoing surface. */
export interface PluginsApi {
  getPlugins(): void;
  openDirectory(id: string): void;
  openSettings(scope: PluginSettingsScope): void;
  copyId(id: string): void;
  setEnabled(id: string, enabled: boolean, scope: PluginSettingsScope): void;
  install(id: string, scope: PluginInstallScope): void;
  openUrl(url: string): void;
}

/** Validate then post a webview message via the host bridge. */
function send(post: (m: unknown) => void, msg: WebviewMessage): void {
  post(parseMessage(msg));
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
    install(id, scope) {
      send(post, { type: "installPlugin", id, scope });
    },
    openUrl(url) {
      send(post, { type: "openUrl", url });
    },
  };
}
