/**
 * Extension-host actions for the Plugins tab: reveal a plugin's directory,
 * open the settings file that decided its state, copy its id.
 *
 * Each takes data the caller has already resolved rather than a raw message
 * payload. That is the security boundary: the webview sends a plugin *id*,
 * the handler looks the id up in the list the host itself parsed, and only
 * then is a path involved. No path from a message ever reaches the
 * filesystem.
 */
import * as vscode from "vscode";
import type { PluginEntry, PluginSettingsScope } from "./types";

/** How a scope reads in an error message. */
const SCOPE_LABEL: Record<PluginSettingsScope, string> = {
  global: "user",
  project: "project",
  local: "local",
  managed: "managed",
};

/**
 * Reveal a plugin's install directory in the OS file manager.
 *
 * `revealFileInOS` rather than opening the folder in VS Code: a plugin's
 * cache directory is reference material, and replacing the user's workspace
 * with it is not what "show me this plugin" means.
 */
export async function revealPluginDirectory(plugin: PluginEntry | undefined): Promise<void> {
  if (!plugin) {
    vscode.window.showErrorMessage("That plugin is no longer in the list — refresh the tab.");
    return;
  }
  if (plugin.installPath === "") {
    vscode.window.showErrorMessage(
      `"${plugin.id}" is enabled in settings but has no installed copy on this machine, so there is no directory to open.`,
    );
    return;
  }
  try {
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(plugin.installPath),
    );
  } catch {
    vscode.window.showErrorMessage(`Could not open ${plugin.installPath}`);
  }
}

/**
 * Open a scope's settings.json in an editor.
 *
 * The scope is the point: "which file turns this plugin on" has no single
 * answer, and landing the user in the wrong one is how a plugin gets
 * disabled twice and stays on.
 */
export async function openPluginSettingsFile(
  filePath: string | null,
  scope: PluginSettingsScope,
): Promise<void> {
  if (filePath === null) {
    vscode.window.showErrorMessage(
      `No workspace folder is open, so there is no ${SCOPE_LABEL[scope]} settings file.`,
    );
    return;
  }
  try {
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
  } catch {
    // A scope whose file has never been written is the common case here —
    // say what is missing rather than reporting a generic open failure.
    vscode.window.showErrorMessage(
      `Could not open ${filePath} — the ${SCOPE_LABEL[scope]} settings file may not exist yet.`,
    );
  }
}

/** Copy a plugin id (`name@marketplace`) to the clipboard. */
export async function copyPluginId(id: string): Promise<void> {
  await vscode.env.clipboard.writeText(id);
}
