/**
 * Detail view -- renders the full session detail panel with metadata,
 * action buttons, info section, and prompt history.
 */

import { icon } from "../../../../webview/icons";
import { esc, fmtTime, fmtDuration, flash } from "../../../../webview/utils";
import {
  sendResumeSession,
  sendOpenProject,
  sendForkSession,
  sendCopyCommand,
  sendPinSession,
  sendUnpinSession,
  sendRenameSession,
  sendExportSession,
} from "../api";
import {
  getDetail,
  isLoading,
  getPinnedIds,
  getCurrentProjectName,
  setView,
} from "../state";
import { showList } from "./listView";
import { confirmDelete } from "../components/contextMenu";

/**
 * Render the detail view for the currently selected session.
 * Shows a loading indicator while the detail is being fetched,
 * then renders the full detail with all action buttons wired up.
 * Falls back to the list view if no detail data is available.
 */
export function showDetail(): void {
  setView("detail");
  document.getElementById("listView")?.classList.add("hidden");
  const dv = document.getElementById("detailView");
  if (!dv) return;
  dv.classList.remove("hidden");

  if (isLoading()) {
    dv.innerHTML = `<button class="back-btn" id="goBack">${icon("arrow-left")} Back</button><div class="loading">Loading...</div>`;
    dv.querySelector("#goBack")?.addEventListener("click", showList);
    return;
  }

  const d = getDetail();
  if (!d) { showList(); return; }

  const date = new Date(d.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = fmtTime(d.startTime);
  const dur = fmtDuration(d.endTime - d.startTime);
  const branch = d.branch && d.branch !== "HEAD" ? d.branch : "";
  const currentProjectName = getCurrentProjectName();
  const isDiffProject = currentProjectName && d.projectKey !== currentProjectName;
  const isPinned = getPinnedIds().has(d.id);

  dv.innerHTML = `
    <button class="back-btn" id="goBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title" title="${esc(d.name || d.summary)}">${esc(d.name || d.summary)}</div>
      ${d.name && d.summary ? `<div class="d-subtitle" title="${esc(d.summary)}">${esc(d.summary)}</div>` : ""}
      <div class="d-tags">
        ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
        <span class="tag folder">${esc(d.project)}</span>
      </div>
      <div class="d-meta">${date} at ${time} · ${dur} · ${d.messageCount} msgs</div>
    </div>

    ${isDiffProject ? `
    <div class="d-notice">
      ${icon("circle-alert")}
      <span>This session belongs to <strong>${esc(d.project)}</strong>. Open that project to resume.</span>
    </div>
    <div class="d-actions">
      <button class="btn primary" id="btnOpenProject">${icon("external-link")} Open ${esc(d.project)}</button>
      <button class="btn" id="btnRename">${icon("pencil")} Rename</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn" id="btnExport" title="Save this session as a portable .jsonl">${icon("upload")} Export</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>` : `
    <div class="d-actions">
      <button class="btn primary" id="btnResume">${icon("play")} Resume</button>
      <button class="btn" id="btnRename">${icon("pencil")} Rename</button>
      <button class="btn" id="btnFork">${icon("git-fork")} Fork</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn" id="btnCopyCmd">${icon("terminal")} Copy Cmd</button>
      <button class="btn" id="btnExport" title="Save this session as a portable .jsonl">${icon("upload")} Export</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>`}

    <div class="d-scroll">
      <div class="d-section">
        <div class="d-label">Info</div>
        <div class="d-kv"><span class="d-k">ID</span><span class="d-v mono">${d.id.slice(0, 18)}...</span></div>
        <div class="d-kv"><span class="d-k">Path</span><span class="d-v mono">${esc(d.project)}</span></div>
        <div class="d-kv"><span class="d-k">Branch</span><span class="d-v">${branch || "\u2014"}</span></div>
      </div>

      ${d.prompts.length ? (() => {
        const MAX_PROMPTS = 50;
        const shown = d.prompts.slice(0, MAX_PROMPTS);
        const hasMore = d.prompts.length > MAX_PROMPTS;
        return `
      <div class="d-section">
        <div class="d-label">Prompts (${d.prompts.length})</div>
        ${shown.map((p, i) => `<div class="d-prompt"><span class="d-pn">${i + 1}</span>${esc(p)}</div>`).join("")}
        ${hasMore ? `<div class="d-prompt" style="color:var(--fg-muted);justify-content:center">...and ${d.prompts.length - MAX_PROMPTS} more</div>` : ""}
      </div>`;
      })() : ""}
    </div>`;

  dv.querySelector("#goBack")?.addEventListener("click", showList);
  dv.querySelector("#btnResume")?.addEventListener("click", () =>
    sendResumeSession(d.id, d.entrypoint, d.projectPath)
  );
  dv.querySelector("#btnOpenProject")?.addEventListener("click", () =>
    sendOpenProject(d.projectPath)
  );
  dv.querySelector("#btnFork")?.addEventListener("click", () =>
    sendForkSession(d.id)
  );
  dv.querySelector("#btnCopyCmd")?.addEventListener("click", () => {
    sendCopyCommand(d.id);
    flash("btnCopyCmd", "Copied!");
  });
  dv.querySelector("#btnPin")?.addEventListener("click", () => {
    if (isPinned) {
      sendUnpinSession(d.id);
    } else {
      sendPinSession(d.id);
    }
  });
  dv.querySelector("#btnRename")?.addEventListener("click", () => sendRenameSession(d.id));
  dv.querySelector("#btnExport")?.addEventListener("click", () => sendExportSession(d.id));
  dv.querySelector("#btnDelete")?.addEventListener("click", () => {
    confirmDelete(d.id, () => showList());
  });
}
