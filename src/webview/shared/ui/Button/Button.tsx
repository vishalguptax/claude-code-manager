/**
 * Themed button. The variant maps to a `btn-<variant>` CSS class managed by the
 * stylesheet, layered on the shared `.btn` base.
 *
 * Variants:
 *   - "secondary" (default) — neutral fill, the existing call-site default.
 *   - "primary"   — accent fill (--vscode-button-background).
 *   - "danger"    — destructive accent (red); equivalent to the legacy
 *     `class="del"` modifier, which still works.
 *   - "icon"      — square, chromeless icon-only button (toolbar/affordance).
 *
 * Optional `iconName` renders a leading <Icon>; `loading` swaps the icon for a
 * spinner and disables the button. Content comes from `label` or `children`
 * (children win when both are present), so existing `<Button>text</Button>`
 * call sites are unchanged.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";
import { Icon } from "../Icon";

export type ButtonVariant = "primary" | "secondary" | "icon" | "danger";

export interface ButtonProps {
  variant?: ButtonVariant;
  /** Leading icon (Lucide name). For `variant="icon"` this is the whole face. */
  iconName?: string;
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  /** Text label; ignored when `children` is provided. */
  label?: string;
  children?: ComponentChildren;
  type?: "button" | "submit" | "reset";
  title?: string;
  ariaLabel?: string;
  class?: string;
}

export function Button(props: ButtonProps) {
  const {
    variant = "secondary",
    iconName,
    loading = false,
    onClick,
    disabled,
    label,
    children,
    type = "button",
    title,
    ariaLabel,
  } = props;

  const content = children ?? label;

  return (
    <button
      type={type}
      class={cx(
        "btn",
        `btn-${variant}`,
        variant === "icon" && "btn-icon",
        loading && "is-loading",
        props.class,
      )}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading ? "true" : undefined}
    >
      {loading ? (
        <span class="btn-spinner" aria-hidden="true">
          <Icon name="refresh-cw" size={14} />
        </span>
      ) : iconName ? (
        <Icon name={iconName} size={14} />
      ) : null}
      {content}
    </button>
  );
}
