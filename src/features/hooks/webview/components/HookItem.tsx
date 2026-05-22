/**
 * A single hook row in the list view. Clicking the body opens the detail
 * view; the inline toggle / delete buttons stop propagation so a tap on an
 * action never also opens the detail surface. Plugin-sourced hooks are
 * read-only — the writer refuses to mutate plugin.json — so they show a
 * "read-only" badge instead of action buttons.
 */
import { Icon } from "../../../../webview/components/Icon";
import { cx } from "../../../../webview/utils/classnames";
import type { Hook } from "../../types";
import { scopeLabel } from "../events";

/** Command preview length before truncating with an ellipsis. */
const PREVIEW_MAX = 60;

export interface HookItemProps {
  hook: Hook;
  onOpen: (hook: Hook) => void;
  onToggle: (hook: Hook) => void;
  onDelete: (hook: Hook) => void;
}

export function HookItem({ hook, onOpen, onToggle, onDelete }: HookItemProps) {
  const preview =
    hook.command.length > PREVIEW_MAX ? `${hook.command.slice(0, PREVIEW_MAX)}…` : hook.command;
  const isPlugin = hook.scope === "plugin";
  const toggleTitle = hook.disabled ? "Enable hook" : "Disable hook";
  const toggleIcon = hook.disabled ? "play" : "pin-off";

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
        {hook.matcher ? (
          <span class="hook-matcher" title={`Matcher: ${hook.matcher}`}>
            {hook.matcher}
          </span>
        ) : (
          <span class="hook-matcher hook-matcher-all">*</span>
        )}
        <span class={cx("scope-badge", hook.scope)} title={scopeLabel(hook)}>
          {scopeLabel(hook)}
        </span>
        {hook.disabled ? <span class="hook-disabled-badge">disabled</span> : null}
        {isPlugin ? (
          <span class="hook-readonly-badge" title={`Owned by plugin ${hook.pluginName ?? ""}`}>
            read-only
          </span>
        ) : (
          <span class="hook-item-actions">
            <button
              type="button"
              class="hook-action-btn"
              title={toggleTitle}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                onToggle(hook);
              }}
            >
              <Icon name={toggleIcon} size={12} />
            </button>
            <button
              type="button"
              class="hook-action-btn del"
              title="Delete hook"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                onDelete(hook);
              }}
            >
              <Icon name="trash-2" size={12} />
            </button>
          </span>
        )}
      </div>
      <div class="hook-item-command">
        <code>{preview}</code>
      </div>
    </div>
  );
}
