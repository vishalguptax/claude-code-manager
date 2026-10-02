/**
 * Reads where Claude Code keeps its files from the VS Code side: the
 * inherited environment plus the official Claude Code extension's
 * `claudeCode.environmentVariables` setting, which sets `CLAUDE_CONFIG_DIR`
 * for the `claude` that extension runs. Resolution rules live in
 * src/core/claudeHome.ts; this module only supplies the setting.
 */
import * as vscode from "vscode";
import { type ClaudeEnv, resolveClaudeEnv, sameClaudeEnv } from "../core/claudeHome";

const RELOAD = "Reload Window";

/** The environment Claude Code runs with under this window's settings. */
export function hostClaudeEnv(): ClaudeEnv {
  const setting = vscode.workspace
    .getConfiguration("claudeCode")
    .get<unknown>("environmentVariables");
  return resolveClaudeEnv(process.env, setting, process.platform);
}

/**
 * Offer a window reload when the setting moves Claude Code's files away
 * from `loaded`, the environment this process resolved its paths from.
 *
 * A reload rather than a live switch: every Claude path is a module-level
 * constant across the feature modules, and file watchers, caches and the
 * account switcher's journal are all bound to them. Re-pointing them in
 * place would leave some on the old folder. Claude Code takes the same
 * stance: when the dir it found its settings through changes after it
 * started, it says to set it before launch and restart.
 */
export function watchClaudeConfigDirSetting(loaded: ClaudeEnv): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(async (e) => {
    if (!e.affectsConfiguration("claudeCode.environmentVariables")) return;
    if (sameClaudeEnv(hostClaudeEnv(), loaded)) return;
    const choice = await vscode.window.showInformationMessage(
      "Claude Code's config folder changed in claudeCode.environmentVariables. " +
        "Reload the window so Claude Code Manager reads sessions and accounts from the new folder.",
      RELOAD,
    );
    if (choice === RELOAD) await vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}
