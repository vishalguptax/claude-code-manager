/**
 * Skill item component -- renders a single skill row in the list.
 */

import { icon } from "../../../../webview/icons";
import { esc } from "../../../../webview/utils";
import { isClaudeCodeExtensionInstalled } from "../../../../webview/extensionStatus";
import { sendLaunchSkillInChat } from "../api";
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

  const chatBtn = isClaudeCodeExtensionInstalled()
    ? `<button class="item-chat-btn" data-chat-name="${esc(skill.name)}" title="Launch /${esc(skill.name)} in Claude Code chat">${icon("message-square", 14)}</button>`
    : "";

  return `
    <div class="item skill-item ${isActive ? "active" : ""}" data-skill-id="${esc(skill.id)}">
      <div class="item-row1">
        <span class="item-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
        ${chatBtn}
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
/**
 * Bind click handlers on skill items using event delegation.
 */
export function bindSkillItems(
  container: HTMLElement,
  callbacks: {
    onSelect: (id: string) => void;
  },
): void {
  container.addEventListener("click", (e: Event) => {
    const target = e.target as HTMLElement;

    // Launch-in-chat button (only rendered when extension is installed).
    const chatBtn = target.closest(".item-chat-btn") as HTMLElement | null;
    if (chatBtn) {
      e.stopPropagation();
      const name = chatBtn.dataset.chatName;
      if (name) sendLaunchSkillInChat(name);
      return;
    }

    // Copy button
    const copyBtn = target.closest(".item-copy-btn") as HTMLElement | null;
    if (copyBtn) {
      e.stopPropagation();
      const name = copyBtn.dataset.copyName;
      if (name) {
        navigator.clipboard?.writeText(name);
        copyBtn.classList.add("copied");
        setTimeout(() => copyBtn.classList.remove("copied"), 1000);
      }
      return;
    }

    // Skill item click
    const item = target.closest(".skill-item") as HTMLElement | null;
    if (item?.dataset.skillId) {
      callbacks.onSelect(item.dataset.skillId);
    }
  });
}
