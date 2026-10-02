/**
 * Host-side message dispatch for the agents feature. Mirrors the MCP
 * feature's pure-handler pattern: every inbound message is validated
 * against the shared valibot schema, the handler depends only on a
 * narrow {@link AgentHostContext}, and it returns `true` when it owns
 * the message (handled or rejected), `false` to fall through.
 *
 * Owns getAgents / openAgentFile (moved here from the sessions
 * featureHandlers monolith) plus create / update / delete / duplicate.
 */
import * as vscode from "vscode";
import type { PanelSink } from "../../extension/panelSink";
import { parseMessage } from "../../shared/protocol/schemas";
import { findAgent, findEditableAgent } from "./access";
import { parseAgents } from "./parser";
import { createAgent, deleteAgent, duplicateAgent, noProjectScopeReason, updateAgent } from "./writer";
import type { Agent } from "./types";

/** Narrow host surface the agents handler needs. Implemented by the provider. */
export interface AgentHostContext {
  getWebview(): PanelSink | undefined;
  getWorkspace(): string | undefined;
  setAgents(agents: Agent[]): void;
}

/**
 * Re-parse agents and push the fresh list (+ any parse errors, and why there
 * is no project scope when there is none) to the webview.
 */
function pushAgents(ctx: AgentHostContext, wv: PanelSink): void {
  const workspace = ctx.getWorkspace();
  const { agents, errors } = parseAgents(workspace);
  ctx.setAgents(agents);
  const noProjectScope = noProjectScopeReason(workspace) ?? undefined;
  wv.postMessage({ type: "agents", data: agents, errors, noProjectScope });
}

/**
 * Validate and handle one agents webview→host message.
 *
 * @returns `true` if it was an agents message (handled or rejected),
 *   `false` to let the caller try the next handler.
 */
export async function handleAgentMessage(
  raw: unknown,
  ctx: AgentHostContext,
): Promise<boolean> {
  const AGENT_TYPES = new Set([
    "getAgents",
    "openAgentFile",
    "createAgent",
    "updateAgent",
    "deleteAgent",
    "duplicateAgent",
  ]);

  let msg: ReturnType<typeof parseMessage>;
  try {
    msg = parseMessage(raw);
  } catch (err) {
    const type = (raw as { type?: unknown } | null)?.type;
    if (typeof type === "string" && AGENT_TYPES.has(type)) {
      console.error("[claude-manager] rejected malformed agents message", err);
      return true;
    }
    return false;
  }

  const wv = ctx.getWebview();

  switch (msg.type) {
    case "getAgents": {
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    // Every path below is the webview's: it is resolved to an agent the host
    // parsed (and, for writes, one inside an editable agents dir) before any
    // file is touched — see access.ts.
    case "openAgentFile": {
      const found = findAgent(msg.path, ctx.getWorkspace());
      if (!found.ok) {
        vscode.window.showErrorMessage(found.error);
        return true;
      }
      try {
        const doc = await vscode.workspace.openTextDocument(found.agent.path);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${found.agent.path}`);
      }
      return true;
    }

    case "createAgent": {
      const result = createAgent(msg.agent, ctx.getWorkspace());
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to create agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    case "updateAgent": {
      const found = findEditableAgent(msg.path, ctx.getWorkspace());
      const result = found.ok ? updateAgent(found.agent.path, msg.agent) : found;
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to update agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    case "deleteAgent": {
      const found = findEditableAgent(msg.path, ctx.getWorkspace());
      if (!found.ok) {
        vscode.window.showErrorMessage(found.error);
        return true;
      }
      const choice = await vscode.window.showWarningMessage(
        "Delete this agent?",
        { modal: true, detail: `This permanently deletes:\n${found.agent.path}` },
        "Delete",
      );
      if (choice !== "Delete") return true;
      // Re-resolve after the modal: the file may have been moved or swapped
      // for a symlink while the user was deciding.
      const still = findEditableAgent(msg.path, ctx.getWorkspace());
      const result =
        still.ok && still.agent.path === found.agent.path
          ? deleteAgent(still.agent.path)
          : {
              ok: false,
              error: still.ok
                ? `${found.agent.path} changed while you were confirming, so it was not deleted.`
                : still.error,
            };
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to delete agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    case "duplicateAgent": {
      const found = findEditableAgent(msg.path, ctx.getWorkspace());
      const result = found.ok ? duplicateAgent(found.agent.path) : found;
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to duplicate agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    default:
      return false;
  }
}
