/**
 * A single command row in the list. Shows the command name, scope badge, and a
 * one-line preview, with copy and (when the Claude Code extension is installed)
 * launch-in-chat affordances built from the shared <Button> and <Badge>.
 */
import { Badge, Button } from "../../../../../webview/shared/ui";
import { cx } from "../../../../../webview/shared/lib";
import type { Command } from "../../../types";
import { previewText } from "../../lib";

export interface CommandItemProps {
  command: Command;
  active: boolean;
  showChatButton: boolean;
  onSelect: (command: Command) => void;
  onCopy: (command: Command) => void;
  onLaunchChat: (command: Command) => void;
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
          <Button
            variant="icon"
            class="item-chat-btn"
            iconName="message-square"
            title={`Launch /${command.name} in Claude Code chat`}
            ariaLabel={`Launch /${command.name} in Claude Code chat`}
            onClick={(e) => {
              e.stopPropagation();
              onLaunchChat(command);
            }}
          />
        ) : null}
        <Button
          variant="icon"
          class="item-copy-btn"
          iconName="copy"
          title={`Copy /${command.name}`}
          ariaLabel={`Copy /${command.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(command);
          }}
        />
        <Badge text={command.scope} variant="scope" class={`cmd-scope-${command.scope}`} />
      </div>
      <div class="cmd-item-preview">{previewText(command)}</div>
    </div>
  );
}
