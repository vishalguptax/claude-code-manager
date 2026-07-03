/**
 * Webview → host message handlers for the non-session features the
 * sessions panel also surfaces: skills, hooks, agents. Returns `true` when
 * the message was handled, `false` to let the caller try the next handler.
 *
 * Commands and MCP own their dispatch in per-feature `messageHandlers.ts`
 * modules (wired ahead of this one); skills/hooks/agents are still handled
 * here until they get the same treatment.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { parseSkills } from "../skills/parser";
import { parseHooks } from "../hooks/parser";
import {
  toggleHookEnabled as writerToggleHookEnabled,
  deleteHook as writerDeleteHook,
  updateHook as writerUpdateHook,
  addHook as writerAddHook,
} from "../hooks/writer";
import { parseAgents } from "../agents/parser";
import { resolveSettingsPath } from "../account/parser";
import { getWorkspace } from "../../extension/workspace";
import { KNOWN_HOOK_EVENTS } from "../hooks/events";
import type { HookScope } from "../hooks/types";
import type { WebviewMessage } from "./types";
import type { HostContext } from "./hostContext";

/** Re-parse hooks and push the fresh list (+ any parse errors) to the webview. */
function pushHooks(ctx: HostContext, wv: vscode.Webview, workspace: string): void {
  const { hooks, errors } = parseHooks(workspace || undefined);
  ctx.setHooks(hooks);
  wv.postMessage({ type: "hooks", data: hooks, errors });
}

export async function handleFeatureMessage(
  msg: WebviewMessage,
  ctx: HostContext,
): Promise<boolean> {
  const wv = ctx.getWebview();
  if (!wv) return true;

  switch (msg.type) {
    // ── Skills messages ──

    case "getSkills": {
      const workspace = getWorkspace();
      const skills = parseSkills(workspace || undefined);
      ctx.setSkills(skills);
      wv.postMessage({ type: "skills", data: skills });
      break;
    }

    case "getSkillDetail": {
      const skill = ctx
        .getSkills()
        .find((s) => s.id === (msg as { type: string; skillId: string }).skillId);
      if (skill) {
        wv.postMessage({ type: "skillDetail", data: skill });
      }
      break;
    }

    case "openSkillFile": {
      const skillPath = (msg as { type: string; skillPath: string }).skillPath;
      const skillFile = path.join(skillPath, "SKILL.md");
      try {
        const doc = await vscode.workspace.openTextDocument(skillFile);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${skillFile}`);
      }
      break;
    }

    case "deleteSkill": {
      const skillPath = (msg as { type: string; skillPath: string }).skillPath;
      const choice = await vscode.window.showWarningMessage(
        `Delete this skill folder?`,
        {
          modal: true,
          detail: `This will permanently delete:\n${skillPath}`,
        },
        "Delete",
      );
      if (choice === "Delete") {
        try {
          fs.rmSync(skillPath, { recursive: true, force: true });
          const workspace = getWorkspace();
          const skills = parseSkills(workspace || undefined);
          ctx.setSkills(skills);
          wv.postMessage({ type: "skills", data: skills });
        } catch (err) {
          vscode.window.showErrorMessage(`Failed to delete: ${(err as Error).message}`);
        }
      }
      break;
    }

    // ── Commands messages ──
    // (getCommands / openCommandFile are handled by the commands feature's
    //  own messageHandlers.ts, wired ahead of this monolith in dispatch.)

    // ── Hooks messages ──

    case "getHooks": {
      pushHooks(ctx, wv, getWorkspace());
      break;
    }

    case "toggleHookEnabled": {
      // Plugin-sourced hooks have no settings.json to mutate — their
      // declaration lives in plugin.json under the plugin install dir.
      // Bail before resolving a path so we never call resolveSettingsPath
      // with a non-permission scope.
      if (msg.hook.scope === "plugin") break;
      const workspace = getWorkspace();
      const filePath = resolveSettingsPath(msg.hook.scope, workspace || undefined);
      const ok = filePath
        ? writerToggleHookEnabled(filePath, msg.hook, msg.hook.disabled)
        : false;
      if (!ok) {
        vscode.window.showErrorMessage(
          `Failed to ${msg.hook.disabled ? "enable" : "disable"} hook — it may have been edited on disk. The list has been refreshed.`,
        );
      }
      pushHooks(ctx, wv, workspace);
      break;
    }

    case "deleteHook": {
      if (msg.hook.scope === "plugin") break;
      const workspace = getWorkspace();
      const choice = await vscode.window.showWarningMessage(
        "Delete this hook?",
        {
          modal: true,
          detail: `Removes the ${msg.hook.event} hook (${msg.hook.matcher || "*"}) from ${msg.hook.scope} settings. This is reversible only by editing settings.json.`,
        },
        "Delete",
      );
      if (choice !== "Delete") break;
      const filePath = resolveSettingsPath(msg.hook.scope, workspace || undefined);
      const ok = filePath ? writerDeleteHook(filePath, msg.hook) : false;
      if (!ok) {
        vscode.window.showErrorMessage(
          "Failed to delete hook — it may have been edited on disk. The list has been refreshed.",
        );
      }
      pushHooks(ctx, wv, workspace);
      break;
    }

    case "updateHook": {
      if (msg.original.scope === "plugin") break;
      const workspace = getWorkspace();
      const filePath = resolveSettingsPath(msg.original.scope, workspace || undefined);
      const ok = filePath ? writerUpdateHook(filePath, msg.original, msg.next) : false;
      if (!ok) {
        vscode.window.showErrorMessage(
          "Failed to update hook — it may have been edited on disk, or is not editable (non-command hooks only support toggle/delete). The list has been refreshed.",
        );
      }
      pushHooks(ctx, wv, workspace);
      break;
    }

    case "promptAddHook": {
      // Native VS Code wizard: scope → event → matcher → command.
      // Each step bails on cancel so a user can dismiss without
      // persisting a partial entry.
      const workspace = getWorkspace();
      // The wizard only writes to settings.json scopes — plugin
      // hooks are read-only, so we deliberately narrow the choice
      // type to exclude that variant. This also keeps writerAddHook
      // / resolveSettingsPath callable without a runtime guard.
      type WritableHookScope = Exclude<HookScope, "plugin">;
      type ScopeOption = vscode.QuickPickItem & { value: WritableHookScope };
      const scopeChoices: ScopeOption[] = [
        { label: "Global", description: "~/.claude/settings.json", value: "global" },
      ];
      if (workspace) {
        scopeChoices.push(
          { label: "Project", description: "<workspace>/.claude/settings.json", value: "project" },
          { label: "Local", description: "<workspace>/.claude/settings.local.json (gitignored)", value: "local" },
        );
      }
      const scopePick = await vscode.window.showQuickPick(scopeChoices, {
        title: "Add hook — scope?",
        placeHolder: "Where should this hook live?",
      });
      if (!scopePick) break;

      const eventChoices: vscode.QuickPickItem[] = [
        ...KNOWN_HOOK_EVENTS.map((e) => ({ label: e.name, description: e.description })),
        { label: "Other…", description: "Type a custom event name" },
      ];
      const eventPick = await vscode.window.showQuickPick(eventChoices, {
        title: "Add hook — event?",
        placeHolder: "Which event should fire this hook?",
      });
      if (!eventPick) break;
      let event = eventPick.label;
      if (event === "Other…") {
        const custom = await vscode.window.showInputBox({
          title: "Add hook — custom event name",
          placeHolder: "Event name as written in Claude CLI docs",
          validateInput: (v) => (v.trim() ? null : "Event name cannot be empty"),
        });
        if (!custom) break;
        event = custom.trim();
      }

      const matcher = await vscode.window.showInputBox({
        title: `Add hook — matcher (optional)`,
        placeHolder: "Tool name / pattern, e.g. Write or Bash(git:*). Leave blank to match all.",
      });
      if (matcher === undefined) break; // user cancelled (empty string is fine)

      const command = await vscode.window.showInputBox({
        title: `Add hook — command`,
        placeHolder: "Shell command to run when the hook fires",
        validateInput: (v) => (v.trim() ? null : "Command cannot be empty"),
      });
      if (!command) break;

      const filePath = resolveSettingsPath(scopePick.value, workspace || undefined);
      if (!filePath) {
        vscode.window.showErrorMessage(
          `Cannot write to ${scopePick.value} scope without a workspace open.`,
        );
        break;
      }
      const ok = writerAddHook(filePath, event, matcher.trim(), command.trim());
      if (!ok) {
        vscode.window.showErrorMessage("Failed to write hook to settings.json.");
      }
      pushHooks(ctx, wv, workspace);
      break;
    }

    // ── MCP messages ──
    // (getMcpServers / openMcpConfig / toggleMcpServer / deleteMcpServer are
    //  handled by the mcp feature's own messageHandlers.ts, wired ahead of
    //  this monolith in dispatch.)

    // ── Agents messages ──

    case "getAgents": {
      const workspace = getWorkspace();
      const { agents, errors } = parseAgents(workspace || undefined);
      ctx.setAgents(agents);
      wv.postMessage({ type: "agents", data: agents, errors });
      break;
    }

    case "openAgentFile": {
      const agentPath = (msg as { type: string; path: string }).path;
      try {
        const doc = await vscode.workspace.openTextDocument(agentPath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${agentPath}`);
      }
      break;
    }

    case "openExtensionSettings": {
      vscode.commands.executeCommand("workbench.action.openSettings", "claudeManager");
      break;
    }

    default:
      return false;
  }
  return true;
}
