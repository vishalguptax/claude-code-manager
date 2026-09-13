/**
 * Field — a labelled control with an explanatory line underneath.
 *
 * The settings and permission surfaces are almost entirely this shape: a
 * label, a control, and one sentence saying what the control does. It lived in
 * account.css as `.acct-field` / `.acct-label` / `.acct-field-hint` and the
 * Config tab rendered those class names across the feature boundary, which is
 * what a missing primitive looks like from the outside.
 *
 * The hint is not decoration. A setting whose effect is not obvious from its
 * label is a setting people change once and then cannot explain, so the hint
 * carries what actually happens — and it is tied to the control by `id`, so a
 * screen reader reads it with the control rather than after it.
 */
import type { ComponentChildren } from "preact";
import { cx } from "../../lib";

export interface FieldProps {
  /** Visible label. Omit for a field whose control labels itself (a checkbox). */
  label?: string;
  /**
   * Links the label and hint to the control. Pass the same id to the control's
   * `id` / `aria-describedby`; without it the hint is just text nearby.
   */
  htmlFor?: string;
  /** One sentence on what the control does, shown under it. */
  hint?: ComponentChildren;
  class?: string;
  children?: ComponentChildren;
}

export function Field({ label, htmlFor, hint, class: cls, children }: FieldProps) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  return (
    <div class={cx("field", cls)}>
      {label ? (
        <label class="field-label" for={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? (
        <div class="field-hint" id={hintId}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
