/**
 * Agent detail view — shows the full configuration and prompt content
 * of a selected agent.
 */

import { esc } from "../../../../webview/utils";
import { icon } from "../../../../webview/icons";
import { getSelectedAgent } from "../state";
import { sendOpenAgentFile } from "../api";
import { showAgentList } from "./listView";

/**
 * Render the detail view for the currently selected agent.
 * Shows the agent name, description, model badge, and full prompt content.
 * Falls back to the list view if no agent is selected.
 *
 * @param container - The DOM element to render into
 */
export function showAgentDetail(container: HTMLElement): void {
  const agent = getSelectedAgent();
  if (!agent) {
    showAgentList(container);
    return;
  }

  // Extract body from content (strip frontmatter)
  let body = agent.content;
  const fmMatch = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    body = fmMatch[1];
  }

  container.innerHTML = `<div class="panel">
    <button class="back-btn" id="agentGoBack">${icon("arrow-left")} Back</button>

    <div class="agent-detail-head">
      <div class="agent-detail-title">${esc(agent.name)}</div>
      <span class="agent-model-badge agent-model-${esc(agent.model)}">${esc(agent.model)}</span>
    </div>

    ${agent.description ? `<div class="agent-detail-desc">${esc(agent.description)}</div>` : ""}

    <div class="agent-detail-actions">
      <button class="btn" id="agentOpenFile">${icon("external-link")} Open File</button>
    </div>

    <div class="agent-detail-path">
      <span class="text-sm text-muted">${esc(agent.path)}</span>
    </div>

    ${body.trim() ? `
    <div class="agent-detail-content">
      <div class="agent-detail-label">System Prompt</div>
      <pre class="agent-detail-pre">${esc(body.trim())}</pre>
    </div>` : ""}
  </div>`;

  container.querySelector("#agentGoBack")?.addEventListener("click", () => {
    showAgentList(container);
  });

  container.querySelector("#agentOpenFile")?.addEventListener("click", () => {
    sendOpenAgentFile(agent.path);
  });
}
