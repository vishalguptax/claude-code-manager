/**
 * Agent item component — renders a single agent row in the list.
 */

import { esc } from "../../../../webview/utils";
import type { Agent } from "../../types";

/**
 * Render a single agent list item as an HTML string.
 * Shows the agent name, model badge (colored by model), and description.
 *
 * @param agent - The agent to render
 * @param isActive - Whether this agent is currently selected
 * @returns HTML string for the agent item
 */
export function renderAgentItem(agent: Agent, isActive: boolean): string {
  const desc = agent.description.length > 80
    ? agent.description.slice(0, 80) + "..."
    : agent.description;

  return `
    <div class="agent-item ${isActive ? "active" : ""}" data-agent-path="${esc(agent.path)}">
      <div class="agent-item-row1">
        <span class="agent-item-name">${esc(agent.name)}</span>
        <span class="agent-model-badge agent-model-${esc(agent.model)}">${esc(agent.model)}</span>
      </div>
      ${desc ? `<div class="agent-item-desc">${esc(desc)}</div>` : ""}
    </div>`;
}

/**
 * Bind click handlers on agent items in a container.
 *
 * @param container - The DOM element containing agent items
 * @param agents - The full list of agents (used for lookup)
 * @param onSelect - Callback when an agent is selected
 */
export function bindAgentItems(
  container: HTMLElement,
  agents: Agent[],
  onSelect: (agent: Agent) => void,
): void {
  container.querySelectorAll(".agent-item").forEach((el) => {
    el.addEventListener("click", () => {
      const agentPath = (el as HTMLElement).dataset.agentPath;
      const agent = agents.find((a) => a.path === agentPath);
      if (agent) onSelect(agent);
    });
  });
}
