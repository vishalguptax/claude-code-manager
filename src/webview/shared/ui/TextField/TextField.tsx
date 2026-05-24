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
 * Controlled, no flicker: `value` drives the element and `onInput` fires with
 * the current string on every `input` event. The element resolves its value
 * before the event fires, so we read it back off the element rather than the
 * synthetic target.
 *
 * The element's value is owned IMPERATIVELY (not via a declared JSX `value`
 * prop). Preact rewrites every declared prop to the DOM on each render; with
 * `value` bound, any render landing while a consumer's controlled `value` lags
 * (config settings debounce the host round-trip) would stomp the user's
 * in-flight keystrokes back — the observed flicker on edit/clear (text removed
 * → snaps back → removed). Instead we seed `value` once on mount and thereafter
 * only write it from a guarded effect that compares the incoming prop against
 * BOTH the element's current value AND the user's last-emitted value (held in a
 * ref). A lagging echo of what the user just typed matches one of those and is
 * suppressed; a genuine external change (account switch, host normalization,
 * reset) differs from both and is applied. This mirrors the proven pattern in
 * Checkbox.tsx.
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

  // Latest onInput in a ref so the (mount-once) input listener never goes stale
  // even though parents pass a fresh inline handler each render.
  const onInputRef = useRef(onInput);
  onInputRef.current = onInput;

  // The value the USER last drove the element to via typing. Held in a ref (not
  // state — it must never trigger a render) so the controlled-sync effect can
  // tell "the prop hasn't caught up to my keystrokes yet" (suppress) from "an
  // external source genuinely changed the value" (apply). Seeded with the
  // initial prop so the first sync is a no-op.
  const userValueRef = useRef(value);

  // Stable ref setter, created once. A fresh inline `ref={el => …}` gets a new
  // identity every render, so Preact tears it down (calls it with null) and
  // re-invokes it on each re-render — churn we don't want on a custom element.
  const storeRef = useRef((el: HTMLElement | null): void => {
    ref.current = el as TextfieldEl | null;
  }).current;

  // NOTE: `value` is intentionally NOT bound as a JSX prop on the element below.
  // Preact writes every JSX prop to the DOM on each render, so binding
  // `value={value}` would let a render that fires while the controlled prop
  // still lags (host echo pending) stomp the element's in-flight text — the
  // observed edit/clear flicker. We own `el.value` entirely through the effects
  // below.

  // Seed the element's initial value once on mount. Empty deps so it never
  // re-runs with a later (possibly mid-echo) prop value.
  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled sync — runs only when the `value` prop actually changes. Apply
  // the incoming prop ONLY when it disagrees with BOTH the element's current
  // value and what the user last typed. After in-flight edits the prop
  // eventually echoes back EQUAL to userValueRef → no write, no revert. A true
  // external change (account switch, host normalization/rejection, reset)
  // differs from both → we apply it and re-baseline the user value to match.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === userValueRef.current) return; // echo of the user's own edit — ignore
    if (value === el.value) return; // element already shows it — nothing to do
    userValueRef.current = value;
    el.value = value;
  }, [value]);

  // Bridge the native `input` event to onInput, reading the resolved value off
  // the element (the synthetic event target is the host element, not the inner
  // input, so `el.value` is the reliable source). Record it as the user's
  // intent so the controlled-sync effect treats the matching echo as a no-op
  // instead of a revert. Mount-once with the latest handler via onInputRef.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => {
      userValueRef.current = el.value;
      onInputRef.current(el.value);
    };
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, []);

  return (
    <vscode-textfield
      ref={storeRef}
      class={cx("vsc-textfield", cls)}
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
