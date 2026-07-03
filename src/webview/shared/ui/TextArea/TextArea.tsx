/**
 * Canonical multi-line text input — a native controlled `<textarea>` styled
 * to match the shared single-line <TextField> (same --vscode-input-* face).
 * Used for agent system prompts, MCP env/headers blocks, hook commands, and
 * other multi-line fields. The only shared textarea in the webview layer.
 *
 * Controlled with the same focus-guarded local mirror as <TextField>: while
 * the field is focused we ignore incoming `value` so a lagging host echo
 * can't stomp in-flight keystrokes; when unfocused we accept `value` verbatim
 * (external resets / programmatic updates apply).
 */
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../../lib";

export interface TextAreaProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
}

export function TextArea(props: TextAreaProps) {
  const { value, onInput, placeholder, rows = 4, disabled, ariaLabel, class: cls } = props;

  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  const handleInput = (e: JSX.TargetedEvent<HTMLTextAreaElement>): void => {
    const next = e.currentTarget.value;
    setLocal(next);
    onInput(next);
  };

  return (
    <textarea
      class={cx("ta-input", cls)}
      value={local}
      rows={rows}
      onInput={handleInput}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setLocal(value);
      }}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
