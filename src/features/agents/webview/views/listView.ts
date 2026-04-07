/**
 * Agents list view — renders the agent list with model badges,
 * with click-to-select navigation to the detail view.
 */

import { esc } from "../../../../webview/utils";
import {
  getAllAgents,
  getSelectedAgent,
  setSelectedAgent,
} from "../state";
import { renderAgentItem, bindAgentItems } from "../components/agentItem";
import { showAgentDetail } from "./detailView";
import type { Agent } from "../../types";

/**
 * Render the agents list into the given container.
 * Shows an empty state when no agents are found.
 *
 * @param container - The DOM element to render into
 */
export function renderAgentsList(container: HTMLElement): void {
  const agents = getAllAgents();
  const selected = getSelectedAgent();

  if (agents.length === 0) {
    container.innerHTML = `
      <div class="agent-empty">
        <div class="agent-empty-title">No agents found</div>
        <div class="agent-empty-desc">
          Agents are <code>.md</code> files in your project's <code>.claude/agents/</code> directory.<br><br>
          Each file uses YAML frontmatter with <code>name</code>, <code>description</code>,
          and <code>model</code> fields, followed by the agent's system prompt.
        </div>
      </div>`;
    return;
  }

  let h = `<div class="agent-list-count">${agents.length} agent${agents.length !== 1 ? "s" : ""}</div>`;

  for (const agent of agents) {
    h += renderAgentItem(agent, selected?.path === agent.path);
  }

  container.innerHTML = h;

  bindAgentItems(container, agents, (agent: Agent) => {
    setSelectedAgent(agent);
    showAgentDetail(container);
  });
}

/**
 * Navigate back to the agent list from the detail view.
 *
 * @param container - The DOM element to render the list into
 */
export function showAgentList(container: HTMLElement): void {
  setSelectedAgent(null);
  renderAgentsList(container);
}
