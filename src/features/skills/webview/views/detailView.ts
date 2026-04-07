/**
 * Skills detail view -- renders the full skill detail panel with metadata,
 * tags, and formatted SKILL.md content.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { sendOpenSkillFile } from "../api";
import { getSelectedSkill } from "../state";
import { showSkillsList } from "./listView";

/**
 * Render the detail view for the currently selected skill.
 * Shows name, description, tags, scope, and the full SKILL.md body
 * as formatted text. Falls back to the list view if no skill is selected.
 */
export function showSkillDetail(): void {
  document.getElementById("skillsListView")?.classList.add("hidden");
  const dv = document.getElementById("skillsDetailView");
  if (!dv) return;
  dv.classList.remove("hidden");

  const skill = getSelectedSkill();
  if (!skill) {
    showSkillsList();
    return;
  }

  // Extract body from content (strip frontmatter)
  let body = skill.content;
  const fmMatch = body.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    body = fmMatch[1];
  }

  dv.innerHTML = `
    <button class="back-btn" id="skillsGoBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title">${esc(skill.name)}</div>
      ${skill.description ? `<div class="d-subtitle">${esc(skill.description)}</div>` : ""}
      <div class="d-tags">
        <span class="skill-scope-badge scope-${skill.scope}">${skill.scope}</span>
        ${skill.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
      </div>
    </div>

    <div class="d-actions">
      <button class="btn" id="btnOpenSkill">${icon("external-link")} Open File</button>
    </div>

    <div class="d-section">
      <div class="d-label">Info</div>
      <div class="d-kv"><span class="d-k">Scope</span><span class="d-v">${skill.scope}</span></div>
      <div class="d-kv"><span class="d-k">Path</span><span class="d-v mono">${esc(skill.path)}</span></div>
      ${skill.tags.length ? `<div class="d-kv"><span class="d-k">Tags</span><span class="d-v">${skill.tags.map((t) => esc(t)).join(", ")}</span></div>` : ""}
    </div>

    ${body.trim() ? `
    <div class="d-section">
      <div class="d-label">Content</div>
      <div class="skill-content">${esc(body.trim())}</div>
    </div>` : ""}`;

  dv.querySelector("#skillsGoBack")?.addEventListener("click", showSkillsList);
  dv.querySelector("#btnOpenSkill")?.addEventListener("click", () => {
    sendOpenSkillFile(skill.path);
  });
}
