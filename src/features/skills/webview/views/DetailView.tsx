/**
 * Skills detail view: full metadata, action buttons, and the SKILL.md body
 * (frontmatter stripped). Rendered when a skill is selected; the back
 * button clears the selection to return to the list.
 */
import { useState } from "preact/hooks";
import { Icon } from "../../../../webview/shared/ui";
import { useApi } from "../../../../webview/shared/hooks";
import type { Skill } from "../../types";
import { claudeCodeInstalled, selectedSkill } from "../signals";
import { deleteSkill, launchSkillInChat, newSession, openSkillFile } from "../api";

/** Strip leading YAML frontmatter from raw SKILL.md content. */
export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return match ? match[1] : content;
}

export interface DetailViewProps {
  skill: Skill;
}

export function DetailView({ skill }: DetailViewProps) {
  const { post } = useApi();
  const [copied, setCopied] = useState(false);
  const body = stripFrontmatter(skill.content).trim();

  function copyName(): void {
    navigator.clipboard?.writeText(`/${skill.name}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div class="panel" id="skillsDetailView">
      <button
        type="button"
        class="back-btn"
        onClick={() => {
          selectedSkill.value = null;
        }}
      >
        <Icon name="arrow-left" /> Back
      </button>

      <div class="d-head">
        <div class="d-title">{skill.name}</div>
        {skill.description ? <div class="d-subtitle">{skill.description}</div> : null}
        <div class="d-tags">
          <span class={`skill-scope-badge scope-${skill.scope}`}>{skill.scope}</span>
          {skill.tags.map((t) => (
            <span key={t} class="tag">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div class="d-actions">
        <button type="button" class="btn primary" onClick={() => newSession(post)}>
          <Icon name="play" /> Open Claude
        </button>
        {claudeCodeInstalled.value ? (
          <button type="button" class="btn" onClick={() => launchSkillInChat(post, skill.name)}>
            <Icon name="message-square" /> Open in Chat
          </button>
        ) : null}
        <button type="button" class="btn" onClick={copyName}>
          <Icon name="copy" /> {copied ? "Copied!" : `Copy /${skill.name}`}
        </button>
        <button type="button" class="btn" onClick={() => openSkillFile(post, skill.path)}>
          <Icon name="external-link" /> Open File
        </button>
        <button type="button" class="btn del" onClick={() => deleteSkill(post, skill.path)}>
          <Icon name="trash-2" /> Delete
        </button>
      </div>

      <div class="d-section">
        <div class="d-label">Info</div>
        <div class="d-kv">
          <span class="d-k">Scope</span>
          <span class="d-v">{skill.scope}</span>
        </div>
        <div class="d-kv">
          <span class="d-k">Path</span>
          <span class="d-v mono">{skill.path}</span>
        </div>
        {skill.tags.length ? (
          <div class="d-kv">
            <span class="d-k">Tags</span>
            <span class="d-v">{skill.tags.join(", ")}</span>
          </div>
        ) : null}
      </div>

      {body ? (
        <div class="d-section">
          <div class="d-label">Content</div>
          <div class="skill-content">{body}</div>
        </div>
      ) : null}
    </div>
  );
}
