/**
 * Type definitions for the agents feature.
 * Covers agent data and extension-webview message protocol.
 */

/** Supported Claude model identifiers for agents. */
export type AgentModel = "sonnet" | "opus" | "haiku" | string;

/**
 * Where an agent definition is sourced from.
 *  - `global`: ~/.claude/agents/
 *  - `project`: <workspace>/.claude/agents/
 *  - `plugin`: provided by an installed plugin (read-only)
 */
export type AgentScope = "global" | "project" | "plugin";

/** A parsed Claude Code agent from .claude/agents/*.md. */
export interface Agent {
  /** Agent name from YAML frontmatter. */
  name: string;
  /** Short description from YAML frontmatter. */
  description: string;
  /** Model identifier from YAML frontmatter (sonnet, opus, haiku). */
  model: AgentModel;
  /** Absolute path to the .md file on disk. */
  path: string;
  /** Full raw content of the agent file (frontmatter + body). */
  content: string;
  /** Source scope — global, project, or plugin. */
  scope: AgentScope;
  /**
   * Qualified plugin name (e.g. "caveman@caveman") when `scope` is
   * `"plugin"`. Undefined otherwise.
   */
  pluginName?: string;
}

// ── Extension <-> Webview Messages ──

/** Messages sent from the extension host to the webview for the agents feature. */
export type AgentsExtensionMessage =
  | { type: "agents"; data: Agent[] }
  | { type: "agentsError"; message: string };

/** Messages sent from the webview to the extension host for the agents feature. */
export type AgentsWebviewMessage =
  | { type: "getAgents" }
  | { type: "openAgentFile"; path: string };
