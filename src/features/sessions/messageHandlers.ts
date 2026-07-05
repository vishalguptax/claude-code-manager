/**
 * Webview → host message dispatch for the sessions view provider.
 *
 * The provider forwards every `WebviewMessage` to `dispatch(msg, ctx)`,
 * which wraps a single try/catch and chains feature-scoped handlers:
 * sessions (this file) → features (skills/commands/hooks/mcp/agents) →
 * account → settings. Each handler returns `true` when it owns the
 * message type and `false` to fall through to the next.
 *
 * `HostContext` and the shared account helpers live in `hostContext.ts`
 * and are re-exported here so existing imports (`./messageHandlers`)
 * keep working.
 */
import * as vscode from "vscode";
import {
  parseSessions,
  parseSessionDetail,
  groupSessions,
  getStats,
  getUniqueProjects,
  searchSessions,
  filterSessions,
  getLastParseWarning,
} from "./parser";
import { searchContent } from "./searchIndex";
import {
  loadState,
  pinSession,
  unpinSession,
  deleteSession,
  renameSession,
  pinSessions as bulkPinState,
  unpinSessions as bulkUnpinState,
  deleteSessions as bulkDeleteState,
} from "./state";
import {
  openProject,
  newSession,
  newTempSession,
  continueLastSession,
  copyResumeCommand,
  copyMarkdown,
  confirmDeleteSession,
  promptRenameSession,
  resumeSession,
  exportSessionFile,
  bulkExportSessionFiles,
  importSessionFile,
  resolveClaudeTarget,
} from "./commands";
import {
  isClaudeCodeExtensionInstalled,
  openPromptInExtension,
} from "../../extension/claudeCodeExtension";
import { createTerminal } from "../../extension/terminal";
import { handleFeatureMessage } from "./featureHandlers";
import { handleAccountMessage } from "./accountHandlers";
import { handleSettingsMessage } from "./settingsHandlers";
import { handleMcpMessage, type McpHostContext } from "../mcp/messageHandlers";
import { handleAgentMessage, type AgentHostContext } from "../agents/messageHandlers";
import { dispatchCommandsMessage, type CommandsHost } from "../commands/messageHandlers";
import { getWorkspace } from "../../extension/workspace";
import { type HostContext, DEMO_SEEN_KEY } from "./hostContext";
import { parseMessage } from "../../shared/protocol/schemas";
import type { WebviewMessage } from "./types";

export {
  DEMO_SEEN_KEY,
  buildSwitchConfirmDetail,
  identityKey,
  type HostContext,
} from "./hostContext";

/**
 * Dispatch a single webview message. Wraps the handler chain in a
 * try/catch so a handler throwing surfaces as a webview `error` message
 * rather than crashing the extension host. No-op when the view is
 * already disposed.
 */
export async function dispatch(msg: WebviewMessage, ctx: HostContext): Promise<void> {
  const wv = ctx.getWebview();
  if (!wv) return;

  // Validate every inbound webview message against the shared valibot
  // schema before dispatching. A malformed message (shape drift, a
  // compromised webview, a protocol mismatch across an upgrade) is logged
  // and dropped rather than fed into the handler chain. parseMessage
  // narrows `unknown` to a `Message`; the handlers below already expect a
  // well-formed `WebviewMessage`, so we keep the original reference once
  // validation succeeds.
  try {
    parseMessage(msg);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `[claude-manager] Rejected malformed webview message (${String((msg as { type?: unknown }).type)}):`,
      detail,
    );
    return;
  }

  const startedAt = Date.now();
  try {
    // Ordered fall-through: the first handler that owns the message type
    // returns true and short-circuits the chain.
    //
    // Sessions runs first because it owns the richer, resumeIn-aware
    // variants of the shared `openUrl` / `launchChatWithPrompt` types —
    // the commands handler also claims those, so the ordering keeps the
    // session behaviour authoritative for them.
    if (await handleSessionMessage(msg, ctx)) return;
    // Commands + MCP route through their own per-feature handlers. The narrow
    // host adapters below let those pure handlers reach the vscode surface
    // without importing the provider.
    if (await dispatchCommandsMessage(msg, makeCommandsHost(ctx))) return;
    if (await handleMcpMessage(msg, makeMcpHost(ctx))) return;
    if (await handleAgentMessage(msg, makeAgentHost(ctx))) return;
    if (await handleFeatureMessage(msg, ctx)) return;
    if (await handleAccountMessage(msg, ctx)) return;
    await handleSettingsMessage(msg, ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[claude-manager] Message handler error (${msg.type}):`, message);
    wv.postMessage({ type: "error", message: `Internal error: ${message}` });
  } finally {
    // Perf tripwire: name any handler that held the dispatch for longer
    // than a UI-noticeable beat. Shows up in Output → Extension Host, so
    // "clicking X feels slow" reports come with the culprit attached.
    // Excludes handlers that legitimately await user input (dialogs) —
    // those idle in a dialog, not in work — identified by their prompt-*
    // naming convention.
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > SLOW_HANDLER_MS && !msg.type.startsWith("prompt")) {
      console.warn(
        `[claude-manager] slow handler: ${msg.type} took ${elapsedMs}ms`,
      );
    }
    // Every webview-originated message gets exactly one ack when its
    // handler finishes (success or error). The webview arms a busy
    // indicator on send and clears it on ack — the user sees progress
    // instead of a dead panel while a slow handler runs.
    ctx.getWebview()?.postMessage({ type: "ack" });
  }
}

/** Dispatch time above which a handler is logged as slow. */
const SLOW_HANDLER_MS = 250;

/**
 * Adapt the shared {@link HostContext} to the narrow {@link CommandsHost}
 * the commands feature's handler depends on. The handler is pure (no vscode
 * import); this adapter is the single place that bridges it to the editor.
 *
 * `openUrl` / `launchChatWithPrompt` are also claimed by the commands
 * handler, but the session handler runs first in the chain and owns the
 * richer variants — so at runtime those never reach here. The bindings are
 * still wired faithfully (not stubbed) so the handler is correct in
 * isolation and unit-testable.
 */
function makeCommandsHost(ctx: HostContext): CommandsHost {
  return {
    post: (m) => {
      ctx.getWebview()?.postMessage(m);
    },
    openFile: async (filePath) => {
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${filePath}`);
      }
    },
    openUrl: (url) => {
      void vscode.env.openExternal(vscode.Uri.parse(url));
    },
    launchChat: async (prompt) => {
      const term = createTerminal("ask");
      term.show();
      term.sendText("claude");
      setTimeout(() => term.sendText(prompt), 1800);
    },
    workspacePath: getWorkspace() || undefined,
  };
}

/**
 * Adapt the shared {@link HostContext} to the MCP feature's
 * {@link McpHostContext}. Re-derives the workspace per call so a folder
 * opened after the webview resolved is reflected.
 */
function makeMcpHost(ctx: HostContext): McpHostContext {
  return {
    getWebview: () => ctx.getWebview(),
    getWorkspace: () => getWorkspace() || undefined,
    setMcpServers: (servers) => ctx.setMcpServers(servers),
    runShellCommand: (label, command) => {
      const term = createTerminal(label);
      term.show();
      term.sendText(command);
    },
    runSlashCommand: (label, slash) => {
      // Same timing as launchSlash: open claude, wait for the REPL to
      // enter raw mode, then type the slash command.
      const term = createTerminal(label);
      term.show();
      term.sendText("claude");
      setTimeout(() => term.sendText(slash), 1800);
    },
  };
}

/** Adapt the shared {@link HostContext} to the agents feature's {@link AgentHostContext}. */
function makeAgentHost(ctx: HostContext): AgentHostContext {
  return {
    getWebview: () => ctx.getWebview(),
    getWorkspace: () => getWorkspace() || undefined,
    setAgents: (agents) => ctx.setAgents(agents),
  };
}

/**
 * Handle the core session-list / detail / lifecycle messages plus the
 * generic file-open. Returns true when the message was handled.
 */
async function handleSessionMessage(
  msg: WebviewMessage,
  ctx: HostContext,
): Promise<boolean> {
  const wv = ctx.getWebview();
  if (!wv) return true;

  switch (msg.type) {
    case "markDemoSeen": {
      await ctx.globalState?.update(DEMO_SEEN_KEY, true);
      break;
    }

    case "ready": {
      ctx.setSessions(parseSessions(loadState().renames));
      ctx.postWorkspacePath();
      ctx.refreshSettings();
      wv.postMessage({ type: "sessions", data: groupSessions(ctx.getSessions()), stats: getStats(ctx.getSessions()) });
      wv.postMessage({ type: "projects", data: getUniqueProjects(ctx.getSessions()) });
      wv.postMessage({ type: "userState", ...loadState() });
      wv.postMessage({ type: "terminalSessions", ids: ctx.terminals.ids() });
      const warning = getLastParseWarning();
      if (warning) wv.postMessage({ type: "error", message: warning });
      // Kick off the full-text index in the background — the webview
      // has its data already, this runs behind the user's first view.
      ctx.buildSearchIndex();
      break;
    }

    case "getSessionDetail": {
      const mode = (msg as { mode?: "first" | "last" }).mode ?? "last";
      const query = (msg as { query?: string }).query ?? "";
      const detail = parseSessionDetail(
        msg.sessionId,
        ctx.getSessions().find((s) => s.id === msg.sessionId),
        mode,
        query,
      );
      if (detail) {
        wv.postMessage({ type: "sessionDetail", data: detail });
      }
      break;
    }

    case "search": {
      const sessions = ctx.getSessions();
      const filtered = msg.query ? searchSessions(sessions, msg.query) : sessions;
      wv.postMessage({ type: "sessions", data: groupSessions(filtered), stats: getStats(filtered) });
      break;
    }

    case "filter": {
      const filtered = filterSessions(ctx.getSessions(), {
        project: msg.project,
        branch: msg.branch,
        dateRange: msg.dateRange,
      });
      wv.postMessage({ type: "sessions", data: groupSessions(filtered), stats: getStats(filtered) });
      break;
    }

    case "refresh":
      ctx.setSessions(parseSessions(loadState().renames));
      wv.postMessage({ type: "sessions", data: groupSessions(ctx.getSessions()), stats: getStats(ctx.getSessions()) });
      ctx.buildSearchIndex();
      break;

    case "reloadAll":
      await ctx.reloadAll();
      break;

    case "searchFullText": {
      // Transcript content search runs synchronously on the pre-built
      // lowercased index. The reply carries the echo-query so the webview
      // can drop stale results if the user has since typed more.
      const ids = searchContent(msg.query);
      wv.postMessage({ type: "fullTextResults", query: msg.query, ids });
      break;
    }

    case "launchChatWithPrompt": {
      // Route via the shared resumeIn setting so Ask Again / Launch
      // in Chat respect the user's chosen surface. Extension → URI
      // handler. Terminal → spawn `claude` and inject prompt after
      // activation (~1800 ms — same timing launchSlash uses).
      // Cap prompt length once up-front regardless of target: URIs
      // cap at ~2 MB in Chromium but shells (cmd/PowerShell) reject
      // far smaller; terminal sendText fine with 4 KB.
      const PROMPT_MAX = 4000;
      const prompt =
        msg.prompt.length > PROMPT_MAX
          ? msg.prompt.slice(0, PROMPT_MAX) + "\n\n…(truncated)"
          : msg.prompt;
      if (msg.prompt.length > PROMPT_MAX) {
        vscode.window.showInformationMessage(
          `Prompt was truncated to ${PROMPT_MAX} characters before launching Claude.`,
        );
      }
      const target = await resolveClaudeTarget(undefined);
      if (target === "cancel") break;
      if (target === "extension") {
        await openPromptInExtension(prompt);
      } else {
        // Terminal path: launch claude, then send the prompt after a
        // short delay so Claude has switched to raw-input mode. Same
        // pattern launchSlash uses for /login + /config.
        const term = createTerminal("ask");
        term.show();
        term.sendText("claude");
        setTimeout(() => term.sendText(prompt), 1800);
      }
      break;
    }

    case "openProjectAndChat": {
      // The URI handler is workspace-scoped, so we have to open the
      // target project first and then fire the URI. VS Code opens
      // the new window asynchronously — the delay lets the Claude
      // Code extension finish activating in the new window before
      // the URI is dispatched. 3000ms is empirical: short enough to
      // not feel laggy, long enough for cold-start activation on
      // slower machines. Without it the URI races activation and
      // the chat tab opens without the prompt attaching.
      openProject(msg.projectPath);
      if (isClaudeCodeExtensionInstalled()) {
        setTimeout(() => openPromptInExtension(""), 3000);
      }
      break;
    }

    case "openProject":
      openProject(msg.projectPath);
      break;

    case "newSession":
      await newSession();
      break;

    case "newTempSession":
      await newTempSession();
      break;

    case "continueLastSession":
      await continueLastSession(ctx.getSessions());
      break;

    case "forkSession":
      await resumeSession(msg.sessionId, true, ctx.getSessions());
      break;

    case "pinSession": {
      const state = pinSession(msg.sessionId);
      wv.postMessage({ type: "userState", ...state });
      break;
    }

    case "unpinSession": {
      const state = unpinSession(msg.sessionId);
      wv.postMessage({ type: "userState", ...state });
      break;
    }

    case "deleteSession": {
      const state = deleteSession(msg.sessionId);
      wv.postMessage({ type: "userState", ...state });
      break;
    }

    case "confirmDelete": {
      const result = await confirmDeleteSession(msg.sessionId, msg.callback);
      if (result) {
        wv.postMessage({
          type: "userState",
          pinned: result.pinned,
          deleted: result.deleted,
          renames: loadState().renames,
        });
        if (result.navigateToList) {
          wv.postMessage({ type: "navigateList" });
        }
      }
      break;
    }

    case "renameSession": {
      const sessions = ctx.getSessions();
      const newName = await promptRenameSession(msg.sessionId, sessions);
      if (newName !== null) {
        const state = renameSession(msg.sessionId, newName);
        // Update cached session in-place instead of re-parsing all from disk
        const target = sessions.find((s) => s.id === msg.sessionId);
        if (target) target.name = newName.trim();
        wv.postMessage({ type: "sessions", data: groupSessions(sessions), stats: getStats(sessions) });
        wv.postMessage({ type: "userState", ...state });
        // Refresh detail view if showing this session
        if (target) {
          const updated = parseSessionDetail(msg.sessionId, target);
          if (updated) wv.postMessage({ type: "sessionDetail", data: updated });
        }
      }
      break;
    }

    case "copyCommand":
      copyResumeCommand(msg.sessionId);
      break;

    case "resumeSession":
      await resumeSession(msg.sessionId, false, ctx.getSessions());
      break;

    case "viewTerminal":
      ctx.terminals.view(msg.sessionId);
      break;

    case "resumeMultiple":
      // Sequential with a short delay between iterations: VS Code
      // registers a new terminal's tab in tabGroups.all asynchronously,
      // so calling createTerminal() in a tight loop made the second
      // and later terminals see an empty tab list and open in fresh
      // editor groups. The 80ms gap gives VS Code's event loop a tick
      // to register the previous tab before findExistingTerminalColumn
      // runs again — the result is all restored terminals stacked as
      // tabs in a single editor group instead of N split panels.
      // Force the terminal path: the Claude Code extension chat tab is
      // single-instance, so routing a multi-session restore through it
      // collapses every session into one panel and only the last survives.
      for (let i = 0; i < msg.sessionIds.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 80));
        await resumeSession(msg.sessionIds[i], false, ctx.getSessions(), true);
      }
      break;

    case "copyMarkdown":
      copyMarkdown(msg.sessionId, ctx.getSessions());
      break;

    case "exportSession":
      await exportSessionFile(msg.sessionId, ctx.getSessions());
      break;

    case "bulkPinSessions": {
      // One state read + write covers every id, then a single
      // `userState` reply keeps the webview re-renders coalesced.
      const state = msg.pin
        ? bulkPinState(msg.ids)
        : bulkUnpinState(msg.ids);
      wv.postMessage({ type: "userState", ...state });
      break;
    }

    case "bulkDeleteSessions": {
      if (msg.ids.length === 0) break;
      const choice = await vscode.window.showWarningMessage(
        `Delete ${msg.ids.length} session${msg.ids.length === 1 ? "" : "s"}?`,
        {
          modal: true,
          detail:
            "Selected sessions will be hidden from the list. The .jsonl files on disk are not removed; running `claude --resume` against them in a terminal still works.",
        },
        "Delete",
      );
      if (choice !== "Delete") break;
      const state = bulkDeleteState(msg.ids);
      wv.postMessage({ type: "userState", ...state });
      wv.postMessage({ type: "navigateList" });
      break;
    }

    case "bulkExportSessions":
      await bulkExportSessionFiles(msg.ids, ctx.getSessions());
      break;

    case "importSession":
      await importSessionFile(ctx.getSessions(), () => {
        // Re-parse so the imported session shows up in the list. We
        // route through the existing reload path instead of duplicating
        // the message-build logic — this also re-posts workspace path
        // and surfaces any schema-drift warning.
        ctx.setSessions(parseSessions(loadState().renames));
        const wv2 = ctx.getWebview();
        if (!wv2) return;
        ctx.postWorkspacePath();
        wv2.postMessage({
          type: "sessions",
          data: groupSessions(ctx.getSessions()),
          stats: getStats(ctx.getSessions()),
        });
        wv2.postMessage({ type: "projects", data: getUniqueProjects(ctx.getSessions()) });
        ctx.buildSearchIndex();
      });
      break;

    case "openUrl":
      vscode.env.openExternal(vscode.Uri.parse(msg.url));
      break;

    // ── Generic file open ──

    case "openFile": {
      const filePath = (msg as { type: string; path: string }).path;
      try {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${filePath}`);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
