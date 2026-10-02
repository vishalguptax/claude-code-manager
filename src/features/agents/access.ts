/**
 * Resolving an agent the webview names by path into one the host may act on.
 *
 * The webview sends a file path; nothing it sends is trusted. Every action
 * re-parses the agents Claude Code would load and acts only on the agent at
 * that path. Writing (update / duplicate / delete) additionally requires an
 * editable scope — global or project, never a plugin's — and a file strictly
 * inside that scope's agents dir, checked on canonical paths so `..` and
 * symlinked parents cannot reach outside it.
 *
 * Pure Node.js — no VS Code dependency.
 */
import { isStrictlyInside, samePath } from "../../core/pathGuard";
import { parseAgents } from "./parser";
import type { Agent } from "./types";
import { agentsDir } from "./writer";

/** A resolved agent, or the user-facing reason the request was refused. */
export type AgentLookup = { ok: true; agent: Agent } | { ok: false; error: string };

/** The parsed agent at `filePath`, of any scope. */
export function findAgent(filePath: string, workspacePath?: string): AgentLookup {
  const agent = parseAgents(workspacePath).agents.find((a) => samePath(a.path, filePath));
  return agent
    ? { ok: true, agent }
    : { ok: false, error: `${filePath} is not an agent Claude Code loads — refresh the list.` };
}

/** Resolve an agent for a write, refusing anything outside an editable agents dir. */
export function findEditableAgent(filePath: string, workspacePath?: string): AgentLookup {
  const found = findAgent(filePath, workspacePath);
  if (!found.ok) return found;
  const { agent } = found;
  const root = agentsDir(agent.scope, workspacePath);
  if (root === null) {
    return {
      ok: false,
      error: `"${agent.name}" belongs to plugin ${agent.pluginName ?? ""} — it is read-only here.`,
    };
  }
  if (!isStrictlyInside(agent.path, root)) {
    return { ok: false, error: `${agent.path} is outside ${root}, so it was left untouched.` };
  }
  return found;
}
