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
 *   - "ghost"     — chromeless icon + LABEL, for a TERTIARY action inside a
 *     strip that already has its own fill (the bulk-select toolbar). Not for
 *     action rows: applying it there stripped the edge off ordinary text
 *     buttons and left them reading as plain text, which is why the blanket
 *     rule was removed. A text button standing on the panel keeps its outline.
 *
 * Optional `iconName` renders a leading <Icon>; `loading` swaps the icon for a
 * spinner and disables the button. Content comes from `label` or `children`
 * (children win when both are present), so existing `<Button>text</Button>`
 * call sites are unchanged.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";
import { Icon } from "../Icon";

/**
 * `outline` is a text button drawn as an edge with no fill — for toolbar
 * actions that must stay legible on a strip without competing with the filled
 * primary beside them. It replaced `.list-count-toggle`, a bespoke rule that
 * was reimplementing exactly this and could drift from it.
 *
 * `icon-outline` is `icon` with its border made visible. Icon buttons are
 * chromeless by default because VS Code's own toolbars are, which is right for
 * a glyph floating in a row — but a glyph sitting in a toolbar beside a filled
 * primary button and a bordered search field reads as unfinished rather than
 * restrained. The outline puts it in the same family as the controls it lines
 * up with, without promoting it to a secondary button's weight.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "icon"
  | "icon-outline"
  | "danger";

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
        // Both icon variants take the square geometry and hover; the outline
        // one only adds a visible edge on top of it.
        (variant === "icon" || variant === "icon-outline") && "btn-icon",
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
