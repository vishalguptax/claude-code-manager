/**
 * A single command row in the list. Shows the command name, scope badge, and a
 * one-line preview, with copy and (when the Claude Code extension is installed)
 * launch-in-chat affordances.
 */
import { Icon } from "../../../../webview/components/Icon";
import { cx } from "../../../../webview/utils/classnames";
import type { Command } from "../../types";

export interface CommandItemProps {
  command: Command;
  active: boolean;
  showChatButton: boolean;
  onSelect: (command: Command) => void;
  onCopy: (command: Command) => void;
  onLaunchChat: (command: Command) => void;
}

/** Build the truncated, single-line preview for a command row. */
function previewText(command: Command): string {
  const source = command.scope === "builtin" ? (command.description ?? "") : command.content;
  const oneLine = source.replace(/\n/g, " ");
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}...` : oneLine;
}

export function CommandItem({
  command,
  active,
  showChatButton,
  onSelect,
  onCopy,
  onLaunchChat,
}: CommandItemProps) {
  return (
    <div
      class={cx("cmd-item", active && "active")}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(command)}
    >
      <div class="cmd-item-row1">
        <span class="cmd-item-name">/{command.name}</span>
        {showChatButton ? (
          <button
            type="button"
            class="item-chat-btn"
            title={`Launch /${command.name} in Claude Code chat`}
            onClick={(e) => {
              e.stopPropagation();
              onLaunchChat(command);
            }}
          >
            <Icon name="message-square" size={14} />
          </button>
        ) : null}
        <button
          type="button"
          class="item-copy-btn"
          title={`Copy /${command.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(command);
          }}
        >
          <Icon name="copy" size={14} />
        </button>
        <span class={cx("cmd-scope-badge", `cmd-scope-${command.scope}`)}>{command.scope}</span>
      </div>
      <div class="cmd-item-preview">{previewText(command)}</div>
    </div>
  );
}
