/**
 * Controlled text input wrapper with consistent styling and value semantics.
 */
import { cx } from "../utils/classnames";

export interface InputProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  type?: "text" | "search" | "email" | "password";
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
}

export function Input(props: InputProps) {
  const { value, onInput, placeholder, type = "text", disabled, ariaLabel } = props;
  return (
    <input
      class={cx("input", props.class)}
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)}
    />
  );
}
