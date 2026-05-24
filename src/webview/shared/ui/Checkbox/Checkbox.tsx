/**
 * Checkbox — a native controlled `<input type="checkbox">` styled to VS Code's
 * Settings-checkbox look (small square, check on selected) via the ambient
 * --vscode-checkbox-* / --vscode-settings-checkbox* theme vars.
 *
 * Why native instead of the old `<vscode-checkbox>` web component: the web
 * component drew its box + check in Shadow DOM and needed an optimistic-toggle
 * + controlled-sync effect to avoid the host-echo flicker (toggle → snap back →
 * re-toggle). Preact controls a native checkbox's `checked` correctly, so a
 * lagging host echo cannot revert the box — no flicker by construction, no
 * useEffect sync, no userValueRef.
 *
 * The whole control is a `<label>` so the caption is a single clickable hit
 * target tied to the box; the box is a custom-drawn square (the native input is
 * the source of truth; a sibling `.cb-box` paints the VS Code chrome + check).
 */

import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../../lib";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  class?: string;
}

export function Checkbox({ checked, onChange, label, disabled, class: cls }: CheckboxProps) {
  // Local mirror + pending-guard: config checkboxes get `checked` back via a
  // host round-trip (click -> setSetting -> echo), which lags. A pure
  // `checked={checked}` box reverts during that window (toggle -> snap back ->
  // re-toggle flicker). After a click we record the emitted value as `pending`
  // and ignore incoming `checked` until it matches (our echo); only then resume
  // applying external changes.
  const [local, setLocal] = useState(checked);
  const pending = useRef<boolean | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: sync keyed on the incoming prop only.
  useEffect(() => {
    if (pending.current !== null) {
      if (checked === pending.current) pending.current = null;
      return;
    }
    setLocal(checked);
  }, [checked]);

  const handleChange = (e: JSX.TargetedEvent<HTMLInputElement>): void => {
    const next = e.currentTarget.checked;
    pending.current = next;
    setLocal(next);
    onChange(next);
  };

  return (
    <label class={cx("cb", cls)}>
      <input
        type="checkbox"
        class="cb-input"
        checked={local}
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
      />
      <span class="cb-box" aria-hidden="true" />
      {label != null ? <span class="cb-label">{label}</span> : null}
    </label>
  );
}
