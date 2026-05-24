/**
 * Canonical single-line text input — a native controlled `<input>` styled to
 * VS Code's Settings/input look via the ambient --vscode-input-* theme vars.
 *
 * Why native instead of the old `<vscode-textfield>` web component: the web
 * component drew its input face in Shadow DOM, which forced three recurring
 * workarounds — a controlled-sync effect to dodge value flicker, a shadow-DOM
 * padding floor we could not pierce, and a box-to-label offset caused by the
 * `.root`-is-100%-of-content-box layout. A native `<input>` removes all three:
 * Preact controls a native input's `value` correctly (no flicker by
 * construction — no useEffect sync, no userValueRef, no imperative ownership),
 * the input's own `padding` is the only text inset (fully ours), and the input
 * box edge IS the element edge IS the label edge (flush, no shadow indirection).
 *
 * Consolidation: this is the ONE text input in the shared layer.
 *
 * Controlled, no flicker: `value` drives the input and `onInput` fires with the
 * current string on every input event. Preact reconciles the controlled
 * `value` prop against the live DOM value, so a lagging host echo cannot stomp
 * in-flight keystrokes — the flicker class is gone by construction.
 *
 * contentBefore / contentAfter ride as plain light-DOM flex children inside a
 * `.tf` container: leading slot, the `<input>` (flex:1), trailing slot. No
 * shadow slots. <SearchInput> uses these for its magnifier + clear button.
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../../lib";

/** Text input types this field forwards to the native `<input>`. */
export type TextFieldType = "text" | "search" | "email" | "password";

export interface TextFieldProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  type?: TextFieldType;
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
  /** Content rendered before the editable area (e.g. a leading icon). */
  contentBefore?: ComponentChildren;
  /** Content rendered after the editable area (e.g. a clear button). */
  contentAfter?: ComponentChildren;
}

export function TextField(props: TextFieldProps) {
  const { value, onInput, placeholder, type = "text", disabled, ariaLabel, class: cls } = props;

  // Local mirror so the field shows keystrokes instantly. Config inputs get
  // their `value` back via a host round-trip (type -> setSetting -> file write
  // -> echo), which lags AND echoes per keystroke. A pure `value={value}`
  // input therefore reverts in-flight text; a naive mirror loses chars to a
  // STALE echo of an earlier keystroke. So: after a user edit we record the
  // emitted value as `pending` and ignore incoming `value` until it catches up
  // to that exact value (our own echo) — only then do we resume applying
  // genuinely-external changes (resets, programmatic updates).
  // Local mirror so keystrokes show instantly. Writes are debounced upstream
  // (one host round-trip per pause), so there is no per-keystroke echo stream
  // to race — a focus guard is enough: while the field is focused (user
  // typing) we ignore incoming `value` so the authoritative-but-lagging echo
  // can't stomp in-flight text; when NOT focused we accept `value` verbatim, so
  // a host-normalized echo (e.g. retention 0 -> "") and external resets are
  // reflected correctly. (An equality-based "pending" guard froze the field
  // whenever the host transformed the written value and the echo never matched.)
  const [local, setLocal] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  const handleInput = (e: JSX.TargetedEvent<HTMLInputElement>): void => {
    const next = e.currentTarget.value;
    setLocal(next);
    onInput(next);
  };
  const handleFocus = (): void => {
    focused.current = true;
  };
  const handleBlur = (): void => {
    focused.current = false;
    setLocal(value); // reconcile to the authoritative host value on blur
  };

  return (
    <span class={cx("tf", cls)}>
      {props.contentBefore}
      <input
        class="tf-input"
        type={type}
        value={local}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {props.contentAfter}
    </span>
  );
}
