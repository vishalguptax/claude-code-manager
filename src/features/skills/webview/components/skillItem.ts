/**
 * Skill item component -- renders a single skill row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import type { Skill } from "../../types";

/**
 * Render a single skill list item as an HTML string.
 *
 * @param skill - The skill to render
 * @param isActive - Whether this skill is currently selected
 * @returns HTML string for the skill item
 */
export function renderSkillItem(skill: Skill, isActive: boolean): string {
  const desc =
    skill.description.length > 60
      ? skill.description.slice(0, 60) + "..."
      : skill.description;

  return `
    <div class="item skill-item ${isActive ? "active" : ""}" data-skill-id="${esc(skill.id)}">
      <div class="item-row1">
        <span class="item-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
        <button class="item-copy-btn" data-copy-name="/${esc(skill.name)}" title="Copy /${esc(skill.name)}">${icon("copy", 14)}</button>
        <span class="skill-scope-badge scope-${skill.scope}">${skill.scope}</span>
      </div>
      ${desc ? `<div class="item-prompt">${esc(desc)}</div>` : ""}
      ${skill.tags.length ? `
      <div class="item-row2">
        ${skill.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
      </div>` : ""}
    </div>`;
}

/**
 * Bind click handlers on skill items in a container.
 *
 * @param container - The DOM element containing skill items
 * @param callbacks - Event handler callbacks
 */
export function bindSkillItems(
  container: HTMLElement,
  callbacks: {
    onSelect: (id: string) => void;
  },
): void {
  container.querySelectorAll(".skill-item").forEach((el) => {
    el.addEventListener("click", (e: Event) => {
      if ((e.target as HTMLElement).closest(".item-copy-btn")) return;
      const id = (el as HTMLElement).dataset.skillId;
      if (!id) return;
      callbacks.onSelect(id);
    });
  });

  container.querySelectorAll(".item-copy-btn").forEach((btn) => {
    btn.addEventListener("click", (e: Event) => {
      e.stopPropagation();
      const name = (btn as HTMLElement).dataset.copyName;
      if (name) {
        navigator.clipboard?.writeText(name);
        const el = btn as HTMLElement;
        el.classList.add("copied");
        setTimeout(() => el.classList.remove("copied"), 1000);
      }
    });
  });
}
