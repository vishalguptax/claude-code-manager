/**
 * Checkbox — a thin Preact wrapper over `<vscode-checkbox>` so it renders with
 * VS Code's native Settings-checkbox look (Shadow DOM, theme-driven check mark
 * and focus ring) instead of a styled `<input type="checkbox">`.
 *
 * Controlled: `checked` drives the element and `onChange` fires with the new
 * boolean on every native `change`. We read `el.checked` back off the element
 * (the synthetic event target is the host, not an inner input). The element
 * draws its own `label` text, so passing `label` keeps the hit target and the
 * caption a single accessible control.
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

  // Keep the element's checked state in sync with the controlled prop.
  useEffect(() => {
    const el = ref.current;
    if (el && el.checked !== checked) el.checked = checked;
  });

  // Bridge the native `change` event to onChange with the resolved state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => onChange(el.checked);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [onChange]);

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
