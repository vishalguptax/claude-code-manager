/**
 * Command detail view — shows the full content of a selected slash command.
 */

import { esc } from "../../../../webview/utils";
import { icon } from "../../../../webview/icons";
import { getSelectedCommand } from "../state";
import { sendOpenCommandFile } from "../api";
import { showCommandList } from "./listView";

/**
 * Render the detail view for the currently selected command.
 * Shows the command name, scope badge, and full markdown content.
 * Falls back to the list view if no command is selected.
 *
 * @param container - The DOM element to render into
 */
export function showCommandDetail(container: HTMLElement): void {
  const cmd = getSelectedCommand();
  if (!cmd) {
    showCommandList(container);
    return;
  }

  container.innerHTML = `
    <button class="back-btn" id="cmdGoBack">${icon("arrow-left")} Back</button>

    <div class="cmd-detail-head">
      <div class="cmd-detail-title">/${esc(cmd.name)}</div>
      <span class="cmd-scope-badge cmd-scope-${cmd.scope}">${cmd.scope}</span>
    </div>

    <div class="cmd-detail-actions">
      <button class="btn" id="cmdOpenFile">${icon("external-link")} Open File</button>
    </div>

    <div class="cmd-detail-path">
      <span class="text-sm text-muted">${esc(cmd.path)}</span>
    </div>

    <div class="cmd-detail-content">
      <div class="cmd-detail-label">Command Template</div>
      <pre class="cmd-detail-pre">${esc(cmd.content)}</pre>
    </div>`;

  container.querySelector("#cmdGoBack")?.addEventListener("click", () => {
    showCommandList(container);
  });

  container.querySelector("#cmdOpenFile")?.addEventListener("click", () => {
    sendOpenCommandFile(cmd.path);
  });
}
