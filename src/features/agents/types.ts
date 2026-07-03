/**
 * Type definitions for the agents feature.
 * Covers agent data and extension-webview message protocol.
 */

/**
 * Model identifier for an agent. `"inherit"` is the truthful default
 * when the frontmatter omits `model` — the agent runs on the main
 * conversation's model, NOT a fabricated "sonnet".
 */
export type AgentModel = "sonnet" | "opus" | "haiku" | "inherit" | string;

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
  /** Model identifier from YAML frontmatter, or "inherit" when unset. */
  model: AgentModel;
  /** Allowed-tools list from frontmatter, when the agent restricts them. */
  tools?: string[];
  /** Preloaded skills from frontmatter, when the agent assigns any. */
  skills?: string[];
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

// MCP postMessage shapes live in the shared protocol
// (src/shared/protocol/messages.ts): getAgents, openAgentFile
// (webview→host) and agents (host→webview, carrying an optional
// `errors` array for surfaced parse failures).
