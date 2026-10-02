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
import { getOutputChannel, recordError as recordWebviewError } from "../diagnostics/errorLog";
import { handlePong } from "../diagnostics/healthCheck";
import { reportIssueCommand } from "../diagnostics/commands";
import type { PanelSink } from "../../extension/panelSink";
import * as path from "path";
import { deleteSkillFolder, findDeletableSkill, findSkill } from "../skills/access";
import { parseSkills } from "../skills/parser";
import { parseHooks } from "../hooks/parser";
import {
  toggleHookEnabled as writerToggleHookEnabled,
  deleteHook as writerDeleteHook,
  updateHook as writerUpdateHook,
  moveHookToFile as writerMoveHookToFile,
  addHook as writerAddHook,
} from "../hooks/writer";
import { resolveSettingsPath } from "../account/parser";
import { getWorkspace } from "../../extension/workspace";
import { createTerminal, runInTerminal } from "../../extension/terminal";
import { KNOWN_HOOK_EVENTS, matcherInfo, matcherPlaceholder } from "../hooks/events";
import type { HookScope } from "../hooks/types";
import type { WebviewMessage } from "./types";
import type { HostContext } from "./hostContext";
import type { WriteOutcome } from "../../core/atomicWrite";

/**
 * A hook scope with no settings file of its own: project scope when the
 * workspace is the home folder (its .claude/settings.json is the global
 * file), or project/local with no folder open.
 */
const NO_SETTINGS_FILE: WriteOutcome = {
  ok: false,
  error: "that scope has no settings file with the current folder",
};

/**
 * Surface a refused or failed hook write. The writer's error says why —
 * "being written, try again" and "not valid JSON, fix it" call for
 * different actions — and the list is re-pushed either way, so it shows
 * what is really on disk.
 */
function reportHookWrite(action: string, outcome: WriteOutcome): void {
  if (outcome.ok) return;
  vscode.window.showErrorMessage(`Failed to ${action}: ${outcome.error}. The list has been refreshed.`);
}

/** Re-parse hooks and push the fresh list (+ any parse errors) to the webview. */
function pushHooks(ctx: HostContext, wv: PanelSink, workspace: string): void {
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
      // Open only a skill the host itself parsed: the path is the webview's,
      // and opening it must not become a way to open any SKILL.md on disk.
      const skillPath = (msg as { type: string; skillPath: string }).skillPath;
      const found = findSkill(skillPath, getWorkspace() || undefined);
      if (!found.ok) {
        vscode.window.showErrorMessage(found.error);
        break;
      }
      const skillFile = path.join(found.skill.path, "SKILL.md");
      try {
        const doc = await vscode.workspace.openTextDocument(skillFile);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${skillFile}`);
      }
      break;
    }

    case "deleteSkill": {
      // The webview's path is never handed to rm: it is resolved to a skill
      // the host parsed, in an editable scope, strictly inside that scope's
      // root (see skills/access.ts).
      const skillPath = (msg as { type: string; skillPath: string }).skillPath;
      const workspace = getWorkspace() || undefined;
      const found = findDeletableSkill(skillPath, workspace);
      if (!found.ok) {
        vscode.window.showErrorMessage(found.error);
        break;
      }
      const choice = await vscode.window.showWarningMessage(
        `Delete this skill folder?`,
        {
          modal: true,
          detail: `This will permanently delete:\n${found.skill.path}`,
        },
        "Delete",
      );
      if (choice === "Delete") {
        try {
          deleteSkillFolder(found.skill);
          const skills = parseSkills(workspace);
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
      reportHookWrite(
        `${msg.hook.disabled ? "enable" : "disable"} hook`,
        filePath ? writerToggleHookEnabled(filePath, msg.hook, msg.hook.disabled) : NO_SETTINGS_FILE,
      );
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
      reportHookWrite("delete hook", filePath ? writerDeleteHook(filePath, msg.hook) : NO_SETTINGS_FILE);
      pushHooks(ctx, wv, workspace);
      break;
    }

    case "updateHook": {
      if (msg.original.scope === "plugin") break;
      const workspace = getWorkspace();
      const fromFile = resolveSettingsPath(msg.original.scope, workspace || undefined);
      // A scope change moves the hook across settings files; same scope
      // edits (matcher/command/event/timeout) stay in one file.
      const nextScope = msg.next.scope ?? msg.original.scope;
      // Never move a hook into plugin scope (read-only, plugin.json-owned).
      if (nextScope === "plugin") break;
      const sameScope = nextScope === msg.original.scope;
      const toFile = sameScope ? fromFile : resolveSettingsPath(nextScope, workspace || undefined);
      let outcome: WriteOutcome = NO_SETTINGS_FILE;
      if (fromFile && toFile) {
        outcome = sameScope
          ? writerUpdateHook(fromFile, msg.original, msg.next)
          : writerMoveHookToFile(fromFile, toFile, msg.original, msg.next);
      }
      reportHookWrite("update hook", outcome);
      pushHooks(ctx, wv, workspace);
      break;
    }

    case "openHooksPanel": {
      // Open the read-only /hooks browser so the user can see what Claude
      // Code actually loaded (same launch pattern as launchSlash).
      const term = createTerminal("hooks");
      term.show();
      runInTerminal(term, "claude");
      setTimeout(() => term.sendText("/hooks"), 1800);
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
      // Project has no file of its own when the home folder is open — it
      // would be ~/.claude/settings.json, i.e. Global — so it is offered
      // only when it resolves.
      if (resolveSettingsPath("project", workspace || undefined)) {
        scopeChoices.push(
          { label: "Project", description: "<workspace>/.claude/settings.json", value: "project" },
        );
      }
      if (workspace) {
        scopeChoices.push(
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

      // Only ask for a matcher when Claude Code tests one for this event, and
      // say what it is tested against — "Tool name" for a SessionStart hook
      // invited a matcher that could never match.
      const info = matcherInfo(event);
      const matcher = info
        ? await vscode.window.showInputBox({
            title: `Add hook — matcher (optional)`,
            placeHolder: matcherPlaceholder(info),
          })
        : "";
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
      reportHookWrite("add hook", writerAddHook(filePath, event, matcher.trim(), command.trim()));
      pushHooks(ctx, wv, workspace);
      break;
    }

    // ── MCP messages ──
    // (getMcpServers / openMcpConfig / toggleMcpServer / deleteMcpServer are
    //  handled by the mcp feature's own messageHandlers.ts, wired ahead of
    //  this monolith in dispatch.)

    // ── Agents messages ──
    // (getAgents / openAgentFile / createAgent / updateAgent / deleteAgent /
    //  duplicateAgent are handled by the agents feature's own messageHandlers.ts,
    //  wired ahead of this monolith in dispatch.)

    case "openExtensionSettings": {
      vscode.commands.executeCommand("workbench.action.openSettings", "claudeManager");
      break;
    }

    case "webviewError": {
      // The panel's own console is out of reach for most users, so the
      // webview's failures are mirrored into the output channel — that is
      // where "report a problem" reads them from, and they outlive the panel.
      recordWebviewError({
        at: Date.now(),
        source: `webview:${msg.source}`,
        message: msg.message,
        stack: msg.stack,
      });
      break;
    }

    case "pong": {
      getOutputChannel().appendLine(
        `[${new Date().toISOString()}] [health] ${handlePong({
          id: msg.id,
          tabs: msg.tabs,
          rootLength: msg.rootLength,
          activeTab: msg.activeTab,
          errors: msg.errors,
          details: msg.details,
        })}`,
      );
      break;
    }

    case "reportIssue": {
      await reportIssueCommand();
      break;
    }

    case "setTabPreferences": {
      // Both keys in one config-service call so VS Code fires exactly one
      // `onDidChangeConfiguration`, and the panel's own listener re-pushes
      // `settings` once rather than twice. `Global` (User scope): tab
      // layout is a personal preference about the sidebar, not something a
      // workspace should be able to force on whoever opens it.
      const cfg = vscode.workspace.getConfiguration("claudeManager");
      await cfg.update("hiddenTabs", msg.hidden, vscode.ConfigurationTarget.Global);
      await cfg.update("tabOrder", msg.order, vscode.ConfigurationTarget.Global);
      break;
    }

    default:
      return false;
  }
  return true;
}
