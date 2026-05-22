/**
 * A single skill row in the list. Shows the name, scope badge, optional
 * copy + launch-in-chat actions, a truncated description, and tags.
 * Stateless: all interaction is delegated to the props callbacks so the
 * component stays trivially testable.
 */
import { cx } from "../../../../webview/utils/classnames";
import { Icon } from "../../../../webview/components/Icon";
import type { Skill } from "../../types";

const DESC_MAX = 60;

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
  const desc =
    skill.description.length > DESC_MAX
      ? `${skill.description.slice(0, DESC_MAX)}...`
      : skill.description;

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
          <button
            type="button"
            class="item-chat-btn"
            title={`Launch /${skill.name} in Claude Code chat`}
            onClick={(e) => {
              e.stopPropagation();
              onLaunchChat(skill.name);
            }}
          >
            <Icon name="message-square" size={14} />
          </button>
        ) : null}
        <button
          type="button"
          class="item-copy-btn"
          title={`Copy /${skill.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(skill.name);
          }}
        >
          <Icon name="copy" size={14} />
        </button>
        <span class={cx("skill-scope-badge", `scope-${skill.scope}`)}>{skill.scope}</span>
      </div>
      {desc ? <div class="item-prompt">{desc}</div> : null}
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
