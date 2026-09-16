/**
 * Host-side message dispatch for the Plugins feature, modelled on
 * `src/features/mcp/messageHandlers.ts`: the feature owns its handler and
 * depends only on a narrow host context, so the sessions panel can delegate
 * to it without either side knowing the other's internals.
 *
 * One deliberate difference from MCP. MCP validates every inbound message
 * with `parseMessage` from the shared valibot schema; these message types
 * are not in that schema yet, so `parseMessage` would reject them all. The
 * guards below are this feature's own boundary check, written to the same
 * standard (every field type-checked, unknown shapes rejected without side
 * effects). Once the variants land in `src/shared/protocol/messages.ts` and
 * `schemas.ts`, `asPluginsMessage` collapses into a `parseMessage` call and
 * nothing else here changes.
 */
import * as vscode from "vscode";
import { copyPluginId, openPluginSettingsFile, revealPluginDirectory } from "./commands";
import { parsePluginsData, settingsScopePaths } from "./parser";
import { type SettingsWriter, setPluginEnabled } from "./state";
import type {
  PluginSettingsScope,
  PluginsData,
  PluginsWebviewMessage,
} from "./types";

/** Narrow host surface the Plugins handler needs. Implemented by the provider. */
export interface PluginsHostContext {
  /** The live webview, or undefined if the view is not currently resolved. */
  getWebview(): vscode.Webview | undefined;
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
}

/** Message types this feature claims. */
const PLUGIN_MESSAGE_TYPES = new Set([
  "getPlugins",
  "openPluginDirectory",
  "openPluginSettings",
  "copyPluginId",
  "setPluginEnabled",
]);

function isScope(value: unknown): value is PluginSettingsScope {
  return value === "global" || value === "project" || value === "local" || value === "managed";
}

/**
 * Validate a raw webview message.
 *
 * Returns the typed message, `null` for a claimed-but-malformed message
 * (caller rejects it), or `undefined` when the message is not ours at all
 * (caller defers to the next handler).
 */
export function asPluginsMessage(raw: unknown): PluginsWebviewMessage | null | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !PLUGIN_MESSAGE_TYPES.has(type)) return undefined;

  const msg = raw as Record<string, unknown>;
  switch (type) {
    case "getPlugins":
      return { type };
    case "openPluginDirectory":
      return typeof msg.id === "string" ? { type, id: msg.id } : null;
    case "copyPluginId":
      return typeof msg.id === "string" ? { type, id: msg.id } : null;
    case "openPluginSettings":
      return isScope(msg.scope) ? { type, scope: msg.scope } : null;
    case "setPluginEnabled":
      return typeof msg.id === "string" &&
        typeof msg.enabled === "boolean" &&
        isScope(msg.scope)
        ? { type, id: msg.id, enabled: msg.enabled, scope: msg.scope }
        : null;
    default:
      return undefined;
  }
}

/** Re-parse and push the whole snapshot. */
function pushPlugins(ctx: PluginsHostContext, wv: vscode.Webview): PluginsData {
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
  const msg = asPluginsMessage(raw);
  if (msg === undefined) return false;
  if (msg === null) {
    console.error("[claude-manager] rejected malformed Plugins message", raw);
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
  }
}
