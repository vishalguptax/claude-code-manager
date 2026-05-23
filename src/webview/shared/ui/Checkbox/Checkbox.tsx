/**
 * Checkbox — a thin Preact wrapper over `<vscode-checkbox>` so it renders with
 * VS Code's native Settings-checkbox look (Shadow DOM, theme-driven check mark
 * and focus ring) instead of a styled `<input type="checkbox">`.
 *
 * Optimistic toggle: a click flips the element's own `checked` immediately and
 * fires `onChange` with the new boolean — we never wait for the controlled prop
 * to round-trip back through the host before the box visibly moves. This is the
 * fix for "config checkboxes do nothing on click": the host re-parses
 * settings.json and re-pushes `accountData` asynchronously, so for a window the
 * prop still holds the OLD value; a naive controlled-sync effect would snap the
 * box back, swallowing the toggle.
 *
 * Controlled-sync without fighting the user: we only push the prop into the
 * element when it actually DIFFERS from what the element currently shows. Once
 * the host echo arrives the prop equals the optimistic value, so the sync is a
 * no-op; if the host rejects/normalizes the write the prop differs and the sync
 * corrects the box. We read `el.checked` back off the element (the synthetic
 * event target is the host, not an inner input). The element draws its own
 * `label` text, so passing `label` keeps the hit target and the caption a single
 * accessible control.
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { cx } from "../../lib";
import "../registerElements";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  class?: string;
}

/** The subset of the `<vscode-checkbox>` DOM API this wrapper touches. */
interface CheckboxEl extends HTMLElement {
  checked: boolean;
}

export function Checkbox({ checked, onChange, label, disabled, class: cls }: CheckboxProps) {
  const ref = useRef<CheckboxEl | null>(null);
  // Latest onChange in a ref so the (mount-once) change listener never goes
  // stale even though parents pass a fresh inline handler each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Controlled sync — only when the prop and the element actually disagree.
  // After an optimistic toggle the element already shows the new value, so the
  // host echo (prop === el.checked) is a no-op and the user's click is never
  // reverted. A genuine external change (different account, host normalization)
  // still flows in because the prop then differs from the element.
  useEffect(() => {
    const el = ref.current;
    if (el && el.checked !== checked) el.checked = checked;
  }, [checked]);

  // Bridge the native `change` event to onChange with the resolved state. The
  // element flips its own `checked` before dispatching `change`, so reading it
  // back here is already the optimistic post-click value.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => onChangeRef.current(el.checked);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  return (
    <vscode-checkbox
      ref={(el: HTMLElement | null) => {
        ref.current = el as CheckboxEl | null;
      }}
      class={cx("vsc-checkbox", cls)}
      checked={checked}
      label={label}
      disabled={disabled}
    />
  );
}

// ── JSX typing for the wrapped custom element ──
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "vscode-checkbox": JSX.HTMLAttributes<HTMLElement> & {
        checked?: boolean;
        label?: string;
        disabled?: boolean;
      };
    }
  }
}
