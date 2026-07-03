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
import { parseMessage } from "../../shared/protocol/schemas";
import { parseAgents } from "./parser";
import { createAgent, updateAgent, deleteAgent, duplicateAgent } from "./writer";
import type { Agent } from "./types";

/** Narrow host surface the agents handler needs. Implemented by the provider. */
export interface AgentHostContext {
  getWebview(): vscode.Webview | undefined;
  getWorkspace(): string | undefined;
  setAgents(agents: Agent[]): void;
}

/** Re-parse agents and push the fresh list (+ any parse errors) to the webview. */
function pushAgents(ctx: AgentHostContext, wv: vscode.Webview): void {
  const { agents, errors } = parseAgents(ctx.getWorkspace());
  ctx.setAgents(agents);
  wv.postMessage({ type: "agents", data: agents, errors });
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

    case "openAgentFile": {
      try {
        const doc = await vscode.workspace.openTextDocument(msg.path);
        await vscode.window.showTextDocument(doc);
      } catch {
        vscode.window.showErrorMessage(`Could not open ${msg.path}`);
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
      const result = updateAgent(msg.path, msg.agent);
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to update agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    case "deleteAgent": {
      const choice = await vscode.window.showWarningMessage(
        "Delete this agent?",
        { modal: true, detail: `This permanently deletes:\n${msg.path}` },
        "Delete",
      );
      if (choice !== "Delete") return true;
      const result = deleteAgent(msg.path);
      if (!result.ok) {
        vscode.window.showErrorMessage(result.error ?? "Failed to delete agent.");
      }
      if (wv) pushAgents(ctx, wv);
      return true;
    }

    case "duplicateAgent": {
      const result = duplicateAgent(msg.path);
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
