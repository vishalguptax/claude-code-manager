/**
 * Canonical single-line text input — a thin Preact wrapper over the
 * `<vscode-textfield>` web component so it renders with VS Code's native
 * Settings/input look (Shadow DOM, theme-driven focus ring, placeholder
 * colour) instead of a hand-styled `<input>`.
 *
 * Why a web component rather than a styled `<input>`: the native element
 * matches the exact input chrome VS Code uses (background, border, focus
 * border) across light/dark/high-contrast themes for free, and exposes
 * `content-before` / `content-after` slots that <SearchInput> uses for the
 * leading magnifier and trailing clear button.
 *
 * Consolidation: this is the ONE text input in the shared layer. The legacy
 * <Input> is now a re-export of <TextField> (see ../Input/index.ts), so both
 * import names resolve to this component.
 *
 * Controlled: `value` drives the element and `onInput` fires with the current
 * string on every `input` event. The element resolves its value before the
 * event fires, so we read it back off the element rather than the synthetic
 * target.
 */
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { cx } from "../../lib";
import "../registerElements";

/** Text input types this wrapper forwards to the native element. */
export type TextFieldType = "text" | "search" | "email" | "password";

export interface TextFieldProps {
  value: string;
  onInput: (value: string) => void;
  placeholder?: string;
  type?: TextFieldType;
  disabled?: boolean;
  class?: string;
  ariaLabel?: string;
  /** Slotted content rendered before the editable area (e.g. a leading icon). */
  contentBefore?: ComponentChildren;
  /** Slotted content rendered after the editable area (e.g. a clear button). */
  contentAfter?: ComponentChildren;
}

/** The subset of the `<vscode-textfield>` DOM API this wrapper touches. */
interface TextfieldEl extends HTMLElement {
  value: string;
}

export function TextField(props: TextFieldProps) {
  const { value, onInput, placeholder, type = "text", disabled, ariaLabel, class: cls } = props;
  const ref = useRef<TextfieldEl | null>(null);

  // Keep the element's value in sync with the controlled prop. The element
  // owns an internal <input>; assigning `value` re-renders its face. We
  // re-assert each render because the element may slot its value asynchronously.
  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  });

  // Bridge the native `input` event to onInput, reading the resolved value off
  // the element (the synthetic event target is the host element, not the inner
  // input, so `el.value` is the reliable source).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => onInput(el.value);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [onInput]);

  return (
    <vscode-textfield
      ref={(el: HTMLElement | null) => {
        ref.current = el as TextfieldEl | null;
      }}
      class={cx("vsc-textfield", cls)}
      value={value}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {props.contentBefore ? <span slot="content-before">{props.contentBefore}</span> : null}
      {props.contentAfter ? <span slot="content-after">{props.contentAfter}</span> : null}
    </vscode-textfield>
  );
}

// ── JSX typing for the wrapped custom element ──
// Preact passes unknown lowercase tags straight to the DOM; this declaration
// adds prop typing without pulling the element class into the bundle.
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "vscode-textfield": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        type?: string;
        placeholder?: string;
        disabled?: boolean;
      };
    }
  }
}
