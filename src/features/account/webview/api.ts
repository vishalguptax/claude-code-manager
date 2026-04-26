/**
 * Typed wrapper around vscode.postMessage for the account webview.
 */

import type { VSCodeAPI } from "../../../webview/types";
import type { PermissionScope } from "../types";

let _vscode: VSCodeAPI;

export function initAccountApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

export function sendGetAccountData(): void {
  _vscode.postMessage({ type: "getAccountData" });
}

export function sendOpenAccountUrl(url: string): void {
  _vscode.postMessage({ type: "openAccountUrl", url });
}

export function sendLaunchSlash(command: string): void {
  _vscode.postMessage({ type: "launchSlash", command });
}

export function sendSetModel(model: string): void {
  _vscode.postMessage({ type: "setModel", model });
}

export function sendSetVoiceEnabled(value: boolean): void {
  _vscode.postMessage({ type: "setVoiceEnabled", value });
}

export function sendSetCommitAttribution(value: string): void {
  _vscode.postMessage({ type: "setCommitAttribution", value });
}

export function sendSetPrAttribution(value: string): void {
  _vscode.postMessage({ type: "setPrAttribution", value });
}

export function sendOpenSettingsFile(scope: PermissionScope): void {
  _vscode.postMessage({ type: "openSettingsFile", scope });
}

export function sendRemovePermission(scope: PermissionScope, tool: string, list: "allow" | "deny"): void {
  _vscode.postMessage({ type: "removePermission", scope, tool, list });
}

export function sendPromptAddPermission(scope: PermissionScope, list: "allow" | "deny"): void {
  _vscode.postMessage({ type: "promptAddPermission", scope, list });
}

export function sendPromptCustomModel(): void {
  _vscode.postMessage({ type: "promptCustomModel" });
}

export function sendRestoreClaudeConfig(): void {
  _vscode.postMessage({ type: "restoreClaudeConfig" });
}

/**
 * Kick off the (opt-in) network call that fetches current quota
 * utilization from Anthropic. The extension host replies with a
 * `quotaData` message; the webview shows a loading state until then.
 */
export function sendFetchQuota(): void {
  _vscode.postMessage({ type: "fetchQuota" });
}

/** Ask the host to pop a native input box for the profile label. */
export function sendPromptSaveProfile(): void {
  _vscode.postMessage({ type: "promptSaveProfile" });
}

/** Open native QuickPick account switcher (switch / save / remove / login new). */
export function sendOpenAccountSwitcher(): void {
  _vscode.postMessage({ type: "openAccountSwitcher" });
}

/**
 * Generic settings writer — takes a dotted key path and a JSON-safe
 * value. Used by the Config tab for fields that don't warrant a
 * dedicated message type (permissions.defaultMode, includeCoAuthoredBy,
 * spinnerTipsEnabled, cleanupPeriodDays, permissions.additionalDirectories).
 * Empty string / null / undefined removes the key.
 */
export function sendSetSetting(
  key: string,
  value: unknown,
  scope: PermissionScope = "global",
): void {
  _vscode.postMessage({ type: "setSetting", key, value, scope });
}

/** Open host-native input box to append an allowed extra-directory path. */
export function sendPromptAddDirectory(): void {
  _vscode.postMessage({ type: "promptAddDirectory" });
}

/** Open VS Code Settings filtered to `claudeManager.*` keys. */
export function sendOpenExtensionSettings(): void {
  _vscode.postMessage({ type: "openExtensionSettings" });
}

/** Fire a whitelisted VS Code command — used for Brain Export/Import. */
export function sendRunCommand(command: string): void {
  _vscode.postMessage({ type: "runCommand", command });
}

/** Confirm-before-delete variant of sendRemovePermission. */
export function sendPromptRemovePermission(
  scope: PermissionScope,
  tool: string,
  list: "allow" | "deny",
): void {
  _vscode.postMessage({ type: "promptRemovePermission", scope, tool, list });
}

/** Rename the scope's settings.json to a .bak sibling and regenerate. */
export function sendResetSettings(scope: PermissionScope): void {
  _vscode.postMessage({ type: "resetSettings", scope });
}

/** Restore a settings.json snapshot taken before a prior mutation. */
export function sendRestoreSettingsSnapshot(
  scope: PermissionScope,
  snapshotId: string,
): void {
  _vscode.postMessage({ type: "restoreSettingsSnapshot", scope, snapshotId });
}

/** Permanently delete a settings.json snapshot. */
export function sendDeleteSettingsSnapshot(
  scope: PermissionScope,
  snapshotId: string,
): void {
  _vscode.postMessage({ type: "deleteSettingsSnapshot", scope, snapshotId });
}
