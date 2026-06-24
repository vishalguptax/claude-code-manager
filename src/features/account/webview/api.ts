/**
 * Typed postMessage wrappers for the account webview. Every send is
 * narrowed to a `WebviewMessage` variant from the shared protocol, so
 * a typo or shape drift fails at compile time. Messages flow through
 * the `useApi()` bridge, which owns the single acquired VS Code API handle.
 */

import type { WebviewMessage } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";
import type { PermissionScope } from "../types";

/** A `post` function that only accepts validated webview messages. */
export interface AccountApi {
  getAccountData(): void;
  launchSlash(command: string): void;
  setModel(model: string): void;
  setVoiceEnabled(value: boolean): void;
  setCommitAttribution(value: string): void;
  setPrAttribution(value: string): void;
  openSettingsFile(scope: PermissionScope): void;
  removePermission(scope: PermissionScope, tool: string, list: "allow" | "deny"): void;
  promptAddPermission(scope: PermissionScope, list: "allow" | "deny"): void;
  restoreClaudeConfig(): void;
  fetchQuota(): void;
  installStatusline(): void;
  uninstallStatusline(): void;
  promptSaveProfile(): void;
  openAccountSwitcher(): void;
}

/**
 * Build the typed account API from the host bridge. Wrapping `useApi`
 * keeps each call site terse (`api.fetchQuota()`) while the `send`
 * helper guarantees the payload satisfies the shared union.
 */
export function useAccountApi(): AccountApi {
  const { post } = useApi();
  const send = (msg: WebviewMessage): void => post(msg);
  return {
    getAccountData: () => send({ type: "getAccountData" }),
    launchSlash: (command) => send({ type: "launchSlash", command }),
    setModel: (model) => send({ type: "setModel", model }),
    setVoiceEnabled: (value) => send({ type: "setVoiceEnabled", value }),
    setCommitAttribution: (value) => send({ type: "setCommitAttribution", value }),
    setPrAttribution: (value) => send({ type: "setPrAttribution", value }),
    openSettingsFile: (scope) => send({ type: "openSettingsFile", scope }),
    removePermission: (scope, tool, list) =>
      send({ type: "removePermission", scope, tool, list }),
    promptAddPermission: (scope, list) =>
      send({ type: "promptAddPermission", scope, list }),
    restoreClaudeConfig: () => send({ type: "restoreClaudeConfig" }),
    fetchQuota: () => send({ type: "fetchQuota" }),
    installStatusline: () => send({ type: "installStatusline" }),
    uninstallStatusline: () => send({ type: "uninstallStatusline" }),
    promptSaveProfile: () => send({ type: "promptSaveProfile" }),
    openAccountSwitcher: () => send({ type: "openAccountSwitcher" }),
  };
}
