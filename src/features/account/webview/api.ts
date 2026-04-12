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

export function sendAddPermission(scope: PermissionScope, tool: string, list: "allow" | "deny"): void {
  _vscode.postMessage({ type: "addPermission", scope, tool, list });
}

export function sendRemovePermission(scope: PermissionScope, tool: string, list: "allow" | "deny"): void {
  _vscode.postMessage({ type: "removePermission", scope, tool, list });
}

export function sendOpenExtensionSettings(): void {
  _vscode.postMessage({ type: "openExtensionSettings" });
}
