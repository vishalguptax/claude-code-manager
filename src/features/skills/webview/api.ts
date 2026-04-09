/**
 * Typed wrapper around vscode.postMessage for all skills webview-to-extension messages.
 * Centralizes all message passing so callers never construct raw objects.
 */

import type { VSCodeAPI } from "../../../webview/types";

let _vscode: VSCodeAPI;

/**
 * Initialize the skills API module with the VS Code API instance.
 * Must be called once at startup before any other API function.
 */
export function initSkillsApi(vscode: VSCodeAPI): void {
  _vscode = vscode;
}

/** Request the list of all skills from the extension. */
export function sendGetSkills(): void {
  _vscode.postMessage({ type: "getSkills" });
}

/** Request full detail for a specific skill. */
export function sendGetSkillDetail(skillId: string): void {
  _vscode.postMessage({ type: "getSkillDetail", skillId });
}

/** Request to open a skill file in the editor. */
export function sendOpenSkillFile(skillPath: string): void {
  _vscode.postMessage({ type: "openSkillFile", skillPath });
}

/** Request to delete a skill folder (with extension-side confirmation). */
export function sendDeleteSkill(skillPath: string): void {
  _vscode.postMessage({ type: "deleteSkill", skillPath });
}
