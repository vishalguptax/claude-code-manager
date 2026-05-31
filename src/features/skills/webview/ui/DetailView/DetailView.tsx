/**
 * Skills detail view: full metadata, action buttons, and the SKILL.md body
 * (frontmatter stripped). Rendered when a skill is selected; the back
 * button clears the selection to return to the list.
 */
import { useState } from "preact/hooks";
import { Badge, Button } from "../../../../../webview/shared/ui";
import { useApi } from "../../../../../webview/shared/hooks";
import type { Skill } from "../../../types";
import { deleteSkill, launchSkillInChat, newSession, openSkillFile } from "../../api";
import { claudeCodeInstalled, selectedSkill } from "../../model";

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
      <Button variant="icon" class="back-btn" iconName="arrow-left" onClick={() => {
        selectedSkill.value = null;
      }}>
        Back
      </Button>

      <div class="d-head">
        <div class="d-title">{skill.name}</div>
        {skill.description ? <div class="d-subtitle">{skill.description}</div> : null}
        <div class="d-tags">
          <Badge variant="scope" text={skill.scope} class={`skill-scope-badge scope-${skill.scope}`} />
          {skill.tags.map((t) => (
            <span key={t} class="tag">
              {t}
            </span>
          ))}
        </div>
      </div>

      <div class="d-actions">
        <Button variant="primary" iconName="play" onClick={() => newSession(post)}>
          Open Claude
        </Button>
        {claudeCodeInstalled.value ? (
          <Button iconName="message-square" onClick={() => launchSkillInChat(post, skill.name)}>
            Open in Chat
          </Button>
        ) : null}
        <Button iconName="copy" onClick={copyName}>
          {copied ? "Copied!" : `Copy /${skill.name}`}
        </Button>
        <Button iconName="external-link" onClick={() => openSkillFile(post, skill.path)}>
          Open File
        </Button>
        <Button variant="danger" iconName="trash-2" onClick={() => deleteSkill(post, skill.path)}>
          Delete
        </Button>
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
