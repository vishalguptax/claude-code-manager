/**
 * Host-side message dispatch for the Plugins feature, modelled on
 * `src/features/mcp/messageHandlers.ts`: the feature owns its handler and
 * depends only on a narrow host context, so the sessions panel can delegate
 * to it without either side knowing the other's internals. Every claimed
 * message is validated against the shared valibot schema before it is acted
 * on; a malformed one is logged and dropped without side effects.
 */
import * as vscode from "vscode";
import type { PanelSink } from "../../extension/panelSink";
import { parseMessage } from "../../shared/protocol/schemas";
import {
  copyPluginId,
  installPluginCommand,
  openPluginSettingsFile,
  revealPluginDirectory,
} from "./commands";
import { parsePluginsData, settingsScopePaths } from "./parser";
import { type SettingsWriter, setPluginEnabled } from "./state";
import type { PluginsData } from "./types";

/** Narrow host surface the Plugins handler needs. Implemented by the provider. */
export interface PluginsHostContext {
  /** The live webview, or undefined if the view is not currently resolved. */
  getWebview(): PanelSink | undefined;
  /** Absolute workspace path, or undefined when no folder is open. */
  getWorkspace(): string | undefined;
  /**
   * The extension's one safe settings writer, injected rather than imported
   * — see the note at the top of `state.ts`. Wire it to
   * `writeSettingsValue` from `src/features/account/parser.ts`. Leave it
   * undefined and the tab is read-only: every other action still works and
   * the toggle explains itself instead of failing silently.
   */
  writeSettingsValue?: SettingsWriter;
  /** Run a shell command in a new terminal, started in `cwd` when given. */
  runShellCommand(label: string, command: string, cwd?: string): void;
}

/** Message types this feature claims. */
const PLUGIN_MESSAGE_TYPES = new Set([
  "getPlugins",
  "openPluginDirectory",
  "openPluginSettings",
  "copyPluginId",
  "setPluginEnabled",
  "installPlugin",
]);

/** Re-parse and push the whole snapshot. */
function pushPlugins(ctx: PluginsHostContext, wv: PanelSink): PluginsData {
  const data = parsePluginsData(ctx.getWorkspace());
  wv.postMessage({ type: "pluginsData", data });
  return data;
}

/**
 * Validate and handle one Plugins webview→host message.
 *
 * @returns `true` if the message was a Plugins message (handled or
 *   rejected), `false` if the caller should try other handlers.
 */
export async function handlePluginsMessage(
  raw: unknown,
  ctx: PluginsHostContext,
): Promise<boolean> {
  const type = (raw as { type?: unknown } | null)?.type;
  if (typeof type !== "string" || !PLUGIN_MESSAGE_TYPES.has(type)) return false;
  let msg: ReturnType<typeof parseMessage>;
  try {
    msg = parseMessage(raw);
  } catch (err) {
    console.error("[claude-manager] rejected malformed Plugins message", err);
    return true;
  }

  const wv = ctx.getWebview();

  switch (msg.type) {
    case "getPlugins": {
      if (wv) pushPlugins(ctx, wv);
      return true;
    }

    case "openPluginDirectory": {
      // Resolve the id against the host's own parse, never against a path
      // the webview supplied.
      const data = parsePluginsData(ctx.getWorkspace());
      await revealPluginDirectory(data.plugins.find((p) => p.id === msg.id));
      return true;
    }

    case "openPluginSettings": {
      const filePath =
        settingsScopePaths(ctx.getWorkspace()).find((s) => s.scope === msg.scope)?.filePath ??
        null;
      await openPluginSettingsFile(filePath, msg.scope);
      return true;
    }

    case "copyPluginId": {
      await copyPluginId(msg.id);
      return true;
    }

    case "setPluginEnabled": {
      const result = setPluginEnabled(
        msg.id,
        msg.enabled,
        msg.scope,
        ctx.getWorkspace(),
        ctx.writeSettingsValue,
      );
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to update enabledPlugins.");
        return true;
      }
      // Re-read rather than patching the cached list: the write may have
      // changed which scope wins, and that is the one thing a row shows
      // that cannot be inferred from the toggle itself.
      if (wv) pushPlugins(ctx, wv);
      return true;
    }

    case "installPlugin": {
      // Resolve the id against the host's own parse, never trust the
      // webview's: only a plugin a registered, policy-allowed marketplace
      // offers ever reaches the command line.
      const workspace = ctx.getWorkspace();
      const entry = parsePluginsData(workspace).available.find((p) => p.id === msg.id);
      if (!entry) {
        vscode.window.showErrorMessage(
          `"${msg.id}" is not offered by any marketplace Claude Code has added — refresh the tab.`,
        );
        return true;
      }
      if (entry.installed) {
        vscode.window.showInformationMessage(`${entry.id} is already installed.`);
        return true;
      }
      // Project and local installs are recorded against the folder
      // `claude` runs in, so they need one — and the terminal must start
      // there rather than wherever the shell profile lands.
      if (msg.scope !== "user" && !workspace) {
        vscode.window.showErrorMessage(
          "Open a folder to install a plugin for a project. A user install needs no folder.",
        );
        return true;
      }
      ctx.runShellCommand(
        `plugin install ${entry.name}`,
        installPluginCommand(entry.id, msg.scope),
        msg.scope === "user" ? undefined : workspace,
      );
      return true;
    }

    default:
      return false;
  }
}
