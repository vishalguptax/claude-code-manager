/**
 * Themed button. Variant maps to a `btn-*` CSS class managed by the stylesheet.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";

export interface ButtonProps {
  variant?: "primary" | "secondary";
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  children?: ComponentChildren;
  type?: "button" | "submit" | "reset";
  class?: string;
}

export function Button(props: ButtonProps) {
  const { variant = "secondary", onClick, disabled, children, type = "button" } = props;
  return (
    <button
      type={type}
      class={cx("btn", `btn-${variant}`, props.class)}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
