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
 * No flicker: the element's `checked` is owned IMPERATIVELY, not via a declared
 * JSX `checked` prop. Preact rewrites every declared prop to the DOM on each
 * render; with `checked` bound, any render landing in the host-echo window
 * (prop still OLD) would stomp the optimistic state back and produce a visible
 * toggle → revert → re-toggle flicker. Instead we seed `checked` once on mount
 * (in the ref callback) and thereafter only write it from a guarded effect that
 * compares the incoming prop against the user's last clicked value (held in a
 * ref). The matching host echo is a no-op; a genuine external change (account
 * switch, host normalization/rejection) differs and is applied. We read
 * `el.checked` back off the element (the synthetic event target is the host,
 * not an inner input). The element draws its own `label` text, so passing
 * `label` keeps the hit target and the caption a single accessible control.
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

  // The value the USER last drove the element to via a click. We hold it in a
  // ref (not state — it must never trigger a render) so the controlled-sync
  // effect can tell "the prop hasn't caught up to my click yet" (suppress) from
  // "an external source genuinely changed the value" (apply). Seeded with the
  // initial prop so the first sync is a no-op.
  const userValueRef = useRef(checked);

  // Stable ref setter, created once. A fresh inline `ref={el => …}` gets a new
  // identity every render, so Preact tears it down (calls it with null) and
  // re-invokes it on each re-render — churn we don't want on a custom element.
  // Capturing it in a ref keeps one identity for the element's lifetime. It
  // only stores the node; seeding `checked` happens in the mount effect.
  const storeRef = useRef((el: HTMLElement | null): void => {
    ref.current = el as CheckboxEl | null;
  }).current;

  // NOTE: `checked` is intentionally NOT bound as a JSX prop on the element
  // below. Preact writes every JSX prop to the DOM on each render, so binding
  // `checked={checked}` would let a render that fires DURING the host-echo
  // window (prop still the OLD value) stomp the element's optimistic state back
  // — the observed flicker (toggle → snap back → echo re-toggles). Instead we
  // own `el.checked` entirely through the effects below. The ref setter is the
  // stable `storeRef` (declared once) so it does NOT re-run — and re-seed a
  // stale value — on every render; seeding happens in the mount effect.

  // Seed the element's initial state once on mount. Empty deps so it never
  // re-runs with a later (possibly mid-echo) prop value — the mount-time
  // `checked` is exactly the initial state we want and subsequent changes flow
  // through the controlled-sync effect below.
  useEffect(() => {
    const el = ref.current;
    if (el && el.checked !== checked) el.checked = checked;
  }, []);

  // Controlled sync — runs only when the `checked` prop actually changes.
  // Apply the incoming prop ONLY when it disagrees with what the user last
  // drove the box to. After an optimistic click the prop eventually echoes
  // back EQUAL to userValueRef → no write, no flicker. A true external change
  // (account switch, host normalization/rejection) differs from the user's
  // intent → we apply it and re-baseline the user value to match.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (checked === userValueRef.current) return; // echo of the user's own click — ignore
    userValueRef.current = checked;
    if (el.checked !== checked) el.checked = checked;
  }, [checked]);

  // Bridge the native `change` event to onChange with the resolved state. The
  // element flips its own `checked` before dispatching `change`, so reading it
  // back here is already the optimistic post-click value. Record it as the
  // user's intent so the controlled-sync effect treats the matching echo as a
  // no-op instead of a revert.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => {
      userValueRef.current = el.checked;
      onChangeRef.current(el.checked);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  return (
    <vscode-checkbox
      ref={storeRef}
      class={cx("vsc-checkbox", cls)}
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
