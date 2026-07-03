/**
 * Webview → host message handlers for Claude settings.json mutations:
 * model / voice / attribution writes, permission allow-deny edits,
 * directory grants, settings reset, config restore, and the slash-command
 * launcher. Returns `true` when the message was handled, `false` to let
 * the caller try the next handler.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  parseAccountData,
  writeSettingsValue,
  addPermissionEntry,
  removePermissionEntry,
  resolveSettingsPath,
  restoreClaudeJsonFromBackup,
} from "../account/parser";
import { getWorkspace } from "../../extension/workspace";
import { createTerminal } from "../../extension/terminal";
import type { WebviewMessage } from "./types";
import type { HostContext } from "./hostContext";

export async function handleSettingsMessage(
  msg: WebviewMessage,
  ctx: HostContext,
): Promise<boolean> {
  const wv = ctx.getWebview();
  if (!wv) return true;

  switch (msg.type) {
    case "launchSlash": {
      // Slash commands (/login, /logout, /config, etc.) must be typed inside
      // a running Claude REPL. There's no CLI arg form that works — passing
      // them directly either gets swallowed by the shell (Git Bash path
      // mangling) or treated as an initial prompt by Claude.
      //
      // Strategy: open a terminal, run `claude`, wait for Claude to switch
      // to raw terminal mode (~1800ms — long enough for most machines),
      // then send the slash command. Shows a notification as a safety net
      // in case the auto-type misses due to slow startup.
      const command = msg.command;
      const term = createTerminal(command);
      term.show();
      term.sendText("claude");
      setTimeout(() => term.sendText(command), 1800);
      vscode.window.showInformationMessage(
        `Opening ${command}. If it doesn't auto-enter, type ${command} manually in the Claude terminal.`,
      );
      break;
    }

    case "setModel": {
      writeSettingsValue("model", msg.model || undefined);
      const workspace = getWorkspace();
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "promptCustomModel": {
      const input = await vscode.window.showInputBox({
        title: "Custom model",
        prompt: "Enter a model alias (e.g. opus) or full ID (e.g. claude-opus-4-7)",
        placeHolder: "claude-opus-4-7",
        validateInput: (v: string) => (v.trim() ? null : "Model name cannot be empty"),
      });
      if (input && input.trim()) {
        writeSettingsValue("model", input.trim());
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      }
      break;
    }

    case "restoreClaudeConfig": {
      // Confirm with the user before overwriting anything.
      const confirm = await vscode.window.showWarningMessage(
        "Restore Claude config from the latest backup?",
        {
          modal: true,
          detail:
            "Your ~/.claude.json is empty or invalid. Claude Code Manager can copy the most recent backup from ~/.claude/backups over it, which preserves your account and settings so Claude CLI doesn't prompt to reset or re-login.",
        },
        "Restore",
      );
      if (confirm !== "Restore") break;
      const restoredFrom = restoreClaudeJsonFromBackup();
      if (restoredFrom) {
        vscode.window.showInformationMessage(
          `Restored ~/.claude.json from backup (${path.basename(restoredFrom)}).`,
        );
        const workspace = getWorkspace();
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      } else {
        vscode.window.showErrorMessage(
          "No valid backup found in ~/.claude/backups. You may need to re-run Claude to regenerate the config.",
        );
      }
      break;
    }

    case "setVoiceEnabled": {
      // Write both keys so both schemas agree — legacy CLI versions
      // read `voiceEnabled`, current CLI reads `voice.enabled`. Without
      // touching both, the toggle could appear to flip back on next
      // open when the CLI overwrites one key and we only wrote the
      // other.
      writeSettingsValue("voiceEnabled", msg.value);
      writeSettingsValue("voice.enabled", msg.value);
      const workspace = getWorkspace();
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "setSetting": {
      // Generic writer — key is dotted path, value is any JSON-safe
      // scalar or array. Empty string / null / undefined removes the
      // key (writeSettingsValue handles that case).
      writeSettingsValue(msg.key, msg.value, msg.scope ?? "global", getWorkspace() || undefined);
      const workspace = getWorkspace();
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "runCommand": {
      // Whitelist guard: webview must not be able to fire arbitrary
      // VS Code commands. Only Claude-Manager-owned commands pass.
      const allowed = new Set([
        "claudeManager.exportBrain",
        "claudeManager.importBrain",
        "claudeManager.switchAccount",
        "claudeManager.open",
        "claudeManager.runDiagnostics",
        "claudeManager.reload",
      ]);
      if (allowed.has(msg.command)) {
        await vscode.commands.executeCommand(msg.command);
      }
      break;
    }

    case "promptRemovePermission": {
      // Confirm-before-delete to prevent mis-click data loss on
      // the inline remove buttons inside the Permissions list.
      const { scope: permScope, tool, list: permList } = msg;
      const confirm = await vscode.window.showWarningMessage(
        `Remove ${permList === "allow" ? "allowed" : "denied"} tool?`,
        {
          modal: true,
          detail: `\"${tool}\" will be removed from the ${permScope} scope. You can re-add it via "Add tool" or by editing the settings file directly.`,
        },
        "Remove",
      );
      if (confirm !== "Remove") break;
      removePermissionEntry(permScope, tool, permList, getWorkspace() || undefined);
      wv.postMessage({
        type: "accountData",
        data: parseAccountData(getWorkspace() || undefined),
      });
      break;
    }

    case "resetSettings": {
      const scope = msg.scope;
      const confirm = await vscode.window.showWarningMessage(
        `Reset ${scope} settings.json?`,
        {
          modal: true,
          detail:
            "The current settings file will be renamed to `settings.json.bak-<timestamp>` and a fresh file will be created on Claude's next launch. All your custom model, voice, attribution, hooks, permissions, and tool allow/deny rules in this scope will stop taking effect until you restore the .bak. Reversible.",
        },
        "Reset",
      );
      if (confirm !== "Reset") break;
      const workspace = getWorkspace();
      const filePath = resolveSettingsPath(scope, workspace || undefined);
      if (!filePath) {
        vscode.window.showErrorMessage(`Can't resolve settings path for ${scope} scope.`);
        break;
      }
      try {
        if (fs.existsSync(filePath)) {
          const bak = `${filePath}.bak-${Date.now()}`;
          fs.renameSync(filePath, bak);
          vscode.window.showInformationMessage(
            `Settings reset. Backup at ${path.basename(bak)}.`,
          );
        } else {
          vscode.window.showInformationMessage(
            `${scope} settings file was already empty.`,
          );
        }
        wv.postMessage({
          type: "accountData",
          data: parseAccountData(workspace || undefined),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Reset failed: ${errMsg}.`);
      }
      break;
    }

    case "promptAddDirectory": {
      const workspace = getWorkspace();
      const current = parseAccountData(workspace || undefined);
      const existing = current.settings.additionalDirectories;
      // Native folder picker beats a raw text input — users don't
      // have to type or copy an absolute path, and the dialog's
      // validation is OS-idiomatic (no missing-path guessing).
      const picked = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Add directory",
        title: "Pick a directory Claude is allowed to read",
      });
      if (!picked || picked.length === 0) break;
      const dir = picked[0].fsPath;
      if (existing.includes(dir)) {
        vscode.window.showInformationMessage(`\"${dir}\" is already in the list.`);
        break;
      }
      const next = [...existing, dir];
      writeSettingsValue(
        "permissions.additionalDirectories",
        next,
        "global",
        workspace || undefined,
      );
      wv.postMessage({
        type: "accountData",
        data: parseAccountData(workspace || undefined),
      });
      break;
    }

    case "setCommitAttribution": {
      writeSettingsValue("attribution.commit", msg.value);
      const workspace = getWorkspace();
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "setPrAttribution": {
      writeSettingsValue("attribution.pr", msg.value);
      const workspace = getWorkspace();
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "openSettingsFile": {
      const workspace = getWorkspace();
      const filePath = resolveSettingsPath(msg.scope, workspace || undefined);
      if (!filePath) {
        vscode.window.showErrorMessage(
          msg.scope === "global" ? "Could not resolve settings path" : "No workspace folder open",
        );
        break;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${filePath}`);
      }
      break;
    }

    case "addPermission": {
      const workspace = getWorkspace();
      addPermissionEntry(msg.scope, msg.tool, msg.list, workspace || undefined);
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    case "promptAddPermission": {
      const workspace = getWorkspace();
      const scope = msg.scope;
      const list = msg.list;

      // Known built-in tool names users can pick from
      const BUILTIN_TOOLS = [
        "Bash(*)",
        "Bash(git:*)",
        "Bash(git push:*)",
        "Bash(npm:*)",
        "Bash(rm:*)",
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "WebSearch",
        "WebFetch",
        "NotebookEdit",
      ];

      // Discover MCP tools from the current mcpServers cache
      const mcpTools = ctx.getMcpServers().map((s) => `mcp__${s.name}__*`);

      const items = [
        ...BUILTIN_TOOLS.map((t) => ({ label: t, description: "built-in" })),
        ...mcpTools.map((t) => ({ label: t, description: "MCP" })),
        { label: "$(edit) Custom pattern…", description: "Enter your own tool pattern" },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        title: `Add ${list === "allow" ? "allowed" : "denied"} tool to ${scope} scope`,
        placeHolder: "Pick a tool or enter a custom pattern",
        matchOnDescription: true,
      });
      if (!pick) break;

      let tool: string | undefined;
      if (pick.label.startsWith("$(edit)")) {
        tool = await vscode.window.showInputBox({
          title: "Custom tool pattern",
          prompt: "Examples: Bash(docker:*), Bash(curl:*), mcp__github__*",
          placeHolder: "Bash(command:*)",
          validateInput: (v: string) => (v.trim() ? null : "Tool pattern cannot be empty"),
        });
      } else {
        tool = pick.label;
      }

      if (tool && tool.trim()) {
        addPermissionEntry(scope, tool.trim(), list, workspace || undefined);
        wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      }
      break;
    }

    case "removePermission": {
      const workspace = getWorkspace();
      removePermissionEntry(msg.scope, msg.tool, msg.list, workspace || undefined);
      wv.postMessage({ type: "accountData", data: parseAccountData(workspace || undefined) });
      break;
    }

    default:
      return false;
  }
  return true;
}
