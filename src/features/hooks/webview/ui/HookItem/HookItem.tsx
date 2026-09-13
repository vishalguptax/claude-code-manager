/**
 * A single hook row in the list view. Clicking the body opens the detail
 * view; the inline toggle / delete buttons stop propagation so a tap on an
 * action never also opens the detail surface. Plugin-sourced hooks are
 * read-only — the writer refuses to mutate plugin.json — so they show a
 * "read-only" badge instead of action buttons.
 */
import { cx } from "../../../../../webview/shared/lib";
import { Badge, Button } from "../../../../../webview/shared/ui";
import type { Hook } from "../../../types";
import { eventUsesMatcher } from "../../../events";
import { scopeLabel } from "../../lib";

export interface HookItemProps {
  hook: Hook;
  onOpen: (hook: Hook) => void;
  onToggle: (hook: Hook) => void;
  onDelete: (hook: Hook) => void;
}

export function HookItem({ hook, onOpen, onToggle, onDelete }: HookItemProps) {
  // Full command. `.hook-item-command code` ellipsizes it at the row edge, so
  // the old 60-character cut just truncated an already-truncated string.
  const preview = hook.command;
  const isPlugin = hook.scope === "plugin";
  const toggleTitle = hook.disabled ? "Enable hook" : "Disable hook";
  // Pause/play, not pin-off: a crossed-out pushpin means "unpin", which is
  // not an action a hook has. These two say stop and resume this handler.
  const toggleIcon = hook.disabled ? "play" : "pause";

  return (
    <div
      class={cx("hook-item", hook.disabled && "is-disabled")}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(hook)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(hook);
        }
      }}
    >
      <div class="hook-item-row1">
        {eventUsesMatcher(hook.event) ? (
          hook.matcher ? (
            <span class="hook-matcher" title={`Matcher: ${hook.matcher}`}>
              {hook.matcher}
            </span>
          ) : (
            <span class="hook-matcher hook-matcher-all">*</span>
          )
        ) : null}
        <Badge
          variant="scope"
          text={scopeLabel(hook)}
          title={scopeLabel(hook)}
          scope={hook.scope}
        />
        {hook.disabled ? <Badge variant="default" text="disabled" /> : null}
        {isPlugin ? (
          <Badge
            variant="default"
            text="read-only"
            title={`Owned by plugin ${hook.pluginName ?? ""}`}
          />
        ) : (
          <span class="hook-item-actions">
            <Button
              variant="icon"
              iconName={toggleIcon}
              title={toggleTitle}
              ariaLabel={toggleTitle}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                onToggle(hook);
              }}
            />
            <Button
              variant="icon"
              class="del"
              iconName="trash-2"
              title="Delete hook"
              ariaLabel="Delete hook"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                onDelete(hook);
              }}
            />
          </span>
        )}
      </div>
      <div class="hook-item-command" title={preview}>
        <code>{preview}</code>
      </div>
    </div>
  );
}
