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
