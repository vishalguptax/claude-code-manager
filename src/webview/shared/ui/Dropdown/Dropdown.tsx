/**
 * Themed single-select dropdown — a thin Preact wrapper over the
 * `<vscode-single-select>` / `<vscode-option>` web components so it renders
 * with VS Code's native Settings-dropdown look (Shadow DOM, theme-driven).
 *
 * Why a web component rather than the v1 hand-rolled `.vs-select`: the native
 * element gives us keyboard nav, focus management, and the exact Settings look
 * for free, and stays theme-correct across light/dark/high-contrast without us
 * re-deriving every token.
 *
 * Features the restore work needs:
 *   - `badge` per option → rendered via the option's `description` field, which
 *     the element draws as trailing muted text (e.g. a session count).
 *   - leading `icon` for the whole control → rendered in the light DOM to the
 *     LEFT of the element (the element's face is Shadow DOM and exposes no
 *     leading slot, so we place the icon beside it inside a flex wrapper). Used
 *     by the branch dropdown's git-branch glyph.
 *   - per-option `marker` text (e.g. "current") → appended to the option label,
 *     since the closed face only shows the selected option's bare label.
 *
 * Selection is controlled: `value` drives the element and `onChange` fires with
 * the newly selected option value. The element emits a standard `change` event.
 */

import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Icon } from "../Icon";
import "../registerElements";

/** One selectable row. `badge` shows as trailing muted text; `marker` annotates the label. */
export interface DropdownOption {
  value: string;
  label: string;
  /** Trailing count/label drawn muted after the option text. */
  badge?: string | number;
  /** Short annotation appended to the label, e.g. "current". */
  marker?: string;
}

export interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  /** Optional leading icon name (Lucide), placed left of the control. */
  icon?: string;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
  title?: string;
  class?: string;
}

/** The subset of the `<vscode-single-select>` DOM API this wrapper touches. */
interface SingleSelectEl extends HTMLElement {
  value: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  icon,
  ariaLabel,
  title,
  class: cls,
}: DropdownProps) {
  const ref = useRef<SingleSelectEl | null>(null);

  // Keep the latest onChange in a ref so the change-event bridge can read it
  // without listing onChange in its dependency array. Parents commonly pass a
  // fresh inline onChange each render; depending on it would detach/re-attach
  // the native `change` listener on every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Keep the element's value in sync with the controlled prop. The element may
  // resolve its value asynchronously when options are still slotting in
  // (documented in vscode-single-select), so we re-assert on every render.
  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  });

  // Bridge the element's native `change` event to the onChange callback. The
  // handler reads value/onChange via refs so the listener attaches once.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (): void => {
      const next = el.value;
      if (next !== value) onChangeRef.current(next);
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [value]);

  return (
    <div class={cls ? `vsc-dropdown ${cls}` : "vsc-dropdown"} title={title}>
      {icon ? (
        <span class="vsc-dropdown-leading" aria-hidden="true">
          <Icon name={icon} size={13} />
        </span>
      ) : null}
      <vscode-single-select
        ref={(el: HTMLElement | null) => {
          ref.current = el as SingleSelectEl | null;
        }}
        value={value}
        aria-label={ariaLabel}
        class="vsc-dropdown-select"
      >
        {options.map((o) => {
          const label = o.marker ? `${o.label} (${o.marker})` : o.label;
          return (
            <vscode-option
              key={o.value}
              value={o.value}
              description={o.badge !== undefined ? String(o.badge) : undefined}
            >
              {label}
            </vscode-option>
          );
        })}
      </vscode-single-select>
    </div>
  );
}

// ── JSX typing for the wrapped custom elements ──
// Preact passes unknown lowercase tags straight through to the DOM; these
// declarations give us prop typing + editor completion without pulling the
// element classes into the bundle.
declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "vscode-single-select": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
      };
      "vscode-option": JSX.HTMLAttributes<HTMLElement> & {
        value?: string;
        description?: string;
      };
    }
  }
}
