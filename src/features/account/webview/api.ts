/**
 * Typed postMessage wrappers for the account webview. Every send is
 * narrowed to a `WebviewMessage` variant from the shared protocol, so
 * a typo or shape drift fails at compile time. Messages flow through
 * the F1 `useApi()` bridge, which owns the single acquired VS Code API
 * handle.
 */

import type { WebviewMessage } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/hooks/useApi";
import type { VSCodeAPI } from "../../../webview/types";
import type { PermissionScope } from "../types";

/** A `post` function that only accepts validated webview messages. */
export interface AccountApi {
  getAccountData(): void;
  openAccountUrl(url: string): void;
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
    openAccountUrl: (url) => send({ type: "openAccountUrl", url }),
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
    promptSaveProfile: () => send({ type: "promptSaveProfile" }),
    openAccountSwitcher: () => send({ type: "openAccountSwitcher" }),
  };
}

// ── Legacy vanilla send* surface (DEPRECATED) ──────────────────────────────
//
// The Config tab (src/features/config/webview/) is still vanilla DOM and
// imports these standalone senders + initAccountApi. They predate the F2
// Preact migration and use a module-local VS Code handle rather than the
// shared useApi() bridge. They are retained ONLY so the Config feature
// keeps building; the Config session removes them when it migrates to
// Preact. Do NOT use them from new Preact code — use useAccountApi().
//
// Each sender still posts a validated WebviewMessage shape, so the host
// parseMessage gate accepts them identically to the hook-based path.

let _legacyVscode: VSCodeAPI | undefined;

/** Wire the legacy senders to the acquired VS Code handle. */
export function initAccountApi(vscode: VSCodeAPI): void {
  _legacyVscode = vscode;
}

function legacySend(msg: WebviewMessage): void {
  _legacyVscode?.postMessage(msg);
}

export function sendGetAccountData(): void {
  legacySend({ type: "getAccountData" });
}
export function sendLaunchSlash(command: string): void {
  legacySend({ type: "launchSlash", command });
}
export function sendOpenSettingsFile(scope: PermissionScope): void {
  legacySend({ type: "openSettingsFile", scope });
}
export function sendSetModel(model: string): void {
  legacySend({ type: "setModel", model });
}
export function sendSetVoiceEnabled(value: boolean): void {
  legacySend({ type: "setVoiceEnabled", value });
}
export function sendSetCommitAttribution(value: string): void {
  legacySend({ type: "setCommitAttribution", value });
}
export function sendSetPrAttribution(value: string): void {
  legacySend({ type: "setPrAttribution", value });
}
export function sendSetSetting(
  key: string,
  value: unknown,
  scope: PermissionScope = "global",
): void {
  legacySend({ type: "setSetting", key, value, scope });
}
export function sendPromptAddPermission(scope: PermissionScope, list: "allow" | "deny"): void {
  legacySend({ type: "promptAddPermission", scope, list });
}
export function sendPromptAddDirectory(): void {
  legacySend({ type: "promptAddDirectory" });
}
export function sendOpenExtensionSettings(): void {
  legacySend({ type: "openExtensionSettings" });
}
export function sendRunCommand(command: string): void {
  legacySend({ type: "runCommand", command });
}
export function sendPromptRemovePermission(
  scope: PermissionScope,
  tool: string,
  list: "allow" | "deny",
): void {
  legacySend({ type: "promptRemovePermission", scope, tool, list });
}
export function sendResetSettings(scope: PermissionScope): void {
  legacySend({ type: "resetSettings", scope });
}
export function sendRestoreSettingsSnapshot(scope: PermissionScope, snapshotId: string): void {
  legacySend({ type: "restoreSettingsSnapshot", scope, snapshotId });
}
export function sendDeleteSettingsSnapshot(scope: PermissionScope, snapshotId: string): void {
  legacySend({ type: "deleteSettingsSnapshot", scope, snapshotId });
}
