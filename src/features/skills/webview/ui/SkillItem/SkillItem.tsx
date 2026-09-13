/**
 * A single skill row in the list. Shows the name, scope badge, optional
 * copy + launch-in-chat actions, a truncated description, and tags.
 * Stateless: all interaction is delegated to the props callbacks so the
 * component stays trivially testable.
 */
import { Badge, Button } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import type { Skill } from "../../../types";

export interface SkillItemProps {
  skill: Skill;
  active: boolean;
  /** Whether the Claude Code extension is installed (gates the chat button). */
  chatEnabled: boolean;
  onSelect: (id: string) => void;
  onCopy: (name: string) => void;
  onLaunchChat: (name: string) => void;
}

export function SkillItem(props: SkillItemProps) {
  const { skill, active, chatEnabled, onSelect, onCopy, onLaunchChat } = props;
  // Full description. It was cut at 60 characters here, which clipped mid-word
  // at a width the component cannot know, and `.item-prompt` then ellipsized
  // the remainder anyway — two truncations, neither at the real edge. CSS does
  // it once; the title attribute reveals the whole line on hover.
  const desc = skill.description;

  return (
    <div
      class={cx("item", "skill-item", active && "active")}
      data-skill-id={skill.id}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(skill.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(skill.id);
        }
      }}
    >
      <div class="item-row1">
        <span class="item-name" title={skill.name}>
          {skill.name}
        </span>
        {chatEnabled ? (
          <Button
            variant="icon"
            class="item-chat-btn"
            iconName="message-square"
            title={`Launch /${skill.name} in Claude Code chat`}
            ariaLabel={`Launch /${skill.name} in Claude Code chat`}
            onClick={(e) => {
              e.stopPropagation();
              onLaunchChat(skill.name);
            }}
          />
        ) : null}
        <Button
          variant="icon"
          class="item-copy-btn"
          iconName="copy"
          title={`Copy /${skill.name}`}
          ariaLabel={`Copy /${skill.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(skill.name);
          }}
        />
        <Badge variant="scope" text={skill.scope} class={`skill-scope-badge scope-${skill.scope}`} />
      </div>
      {desc ? <div class="item-prompt" title={desc}>{desc}</div> : null}
      {skill.tags.length ? (
        <div class="item-row2">
          {skill.tags.map((t) => (
            <span key={t} class="tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
