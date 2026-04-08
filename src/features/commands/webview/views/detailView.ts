/**
 * Command detail view — shows the full content of a selected slash command.
 */

import { esc } from "../../../../webview/utils";
import { icon } from "../../../../webview/icons";
import { getSelectedCommand } from "../state";
import { sendOpenCommandFile } from "../api";
import { sendOpenUrl } from "../../../sessions/webview/api";
import { showCommandList } from "./listView";

/** URL to the official Claude Code built-in commands documentation. */
const BUILTIN_DOCS_URL = "https://code.claude.com/docs/en/commands";

/**
 * Render the detail view for the currently selected command.
 *
 * For built-in commands, shows the name, description, and a link to the
 * official documentation. For custom commands, shows the name, scope, file
 * path, and the full markdown template content.
 *
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

  if (cmd.scope === "builtin") {
    container.innerHTML = `<div class="panel">
      <button class="back-btn" id="cmdGoBack">${icon("arrow-left")} Back</button>

      <div class="cmd-detail-head">
        <div class="cmd-detail-title">/${esc(cmd.name)}</div>
        <span class="cmd-scope-badge cmd-scope-builtin">builtin</span>
      </div>

      <div class="cmd-detail-actions">
        <button class="btn" id="cmdOpenDocs">${icon("external-link")} View Docs</button>
      </div>

      <div class="cmd-detail-content">
        <div class="cmd-detail-label">Description</div>
        <div class="cmd-detail-desc">${esc(cmd.description ?? "")}</div>
        <div class="cmd-detail-label" style="margin-top: var(--space-xl)">Documentation</div>
        <a class="cmd-detail-link" href="${BUILTIN_DOCS_URL}" id="cmdDocsLink">${esc(BUILTIN_DOCS_URL)}</a>
      </div>
    </div>`;

    container.querySelector("#cmdGoBack")?.addEventListener("click", () => {
      showCommandList(container);
    });

    container.querySelector("#cmdOpenDocs")?.addEventListener("click", () => {
      sendOpenUrl(BUILTIN_DOCS_URL);
    });
    container.querySelector("#cmdDocsLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      sendOpenUrl(BUILTIN_DOCS_URL);
    });
    return;
  }

  container.innerHTML = `<div class="panel">
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
    </div>
  </div>`;

  container.querySelector("#cmdGoBack")?.addEventListener("click", () => {
    showCommandList(container);
  });

  container.querySelector("#cmdOpenFile")?.addEventListener("click", () => {
    sendOpenCommandFile(cmd.path);
  });
}
