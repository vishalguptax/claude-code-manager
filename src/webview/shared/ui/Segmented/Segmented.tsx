/**
 * Segmented — the single segmented-control primitive for the webview. A row of
 * mutually-exclusive segments where exactly one is active: date ranges
 * (Recent/Week/Month/All), scope filters (All/Project/Global/Plugin), usage
 * periods (7 days/30 days/All time). One control wired to the design-system
 * role tokens, used wherever a row of toggle segments is needed.
 *
 * Native VS Code look (see `.vsc-segmented` in components-native.css): the whole
 * control is a recessed TRACK with a subtle border; the selected segment gets a
 * subtle raised fill (--role-selected-*), NOT primary blue; unselected segments
 * are transparent with the muted description colour. This is the deliberate fix
 * for the "everything is blue" hierarchy problem — selected state is distinct
 * from the solid-blue primary button.
 *
 * Each option may carry a `count` rendered as a trailing number (kept from the
 * ScopeFilter it absorbs). The caller decides which options appear (e.g. hiding
 * the Plugin segment when empty) — this renders exactly what it is given, in
 * order.
 *
 * Generic over the option value type so feature unions (`"all" | "project" | …`,
 * `DateFilter`, `TimePeriod`) flow through `onChange` without a cast.
 *
 * Keyboard: it is a `role="radiogroup"` of `role="radio"` buttons. Arrow
 * Left/Up selects the previous segment, Right/Down the next (wrapping), Home/End
 * jump to the ends — matching VS Code's own segmented toggles and the WAI-ARIA
 * radio-group pattern.
 */
import { cx } from "../../lib";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: string;
  /** Optional trailing count shown after the label, e.g. a scope item count. */
  count?: number;
}

export interface SegmentedProps<V extends string = string> {
  value: V;
  options: SegmentedOption<V>[];
  onChange: (value: V) => void;
  /** Accessible label for the group (announced by screen readers). */
  ariaLabel?: string;
  /** Compact variant — smaller height/padding for inline toggles. */
  size?: "default" | "sm";
  /**
   * Dimmed + non-interactive while still occupying layout. Used where the
   * toggle is contextually meaningless for a moment (e.g. the sessions
   * Latest/Earliest mode toggle while a transcript search is active) but
   * removing it from the DOM would reflow the surrounding header. Keystrokes
   * and clicks are suppressed and the group leaves the tab order.
   */
  disabled?: boolean;
  class?: string;
}

/**
 * One segment button. Hoisted to module scope so it is a single stable
 * component identity rather than a closure recreated inside the map on every
 * Segmented render.
 */
/** Stable no-op so the keydown handler has one identity when disabled. */
function noop(): void {}

function Segment<V extends string>({
  opt,
  active,
  disabled,
  onSelect,
  onKeyDown,
}: {
  opt: SegmentedOption<V>;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      class={cx("vsc-segmented-seg", active && "active")}
      role="radio"
      aria-checked={active}
      disabled={disabled}
      // Roving tabindex: only the selected segment is in the tab order; arrows
      // move between segments once the group has focus (WAI-ARIA radio group).
      // When disabled the whole group leaves the tab order (-1 on every seg).
      tabIndex={disabled ? -1 : active ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      {/* Count rides in the SAME text node as the label (`Label (count)`),
          not a child span — this keeps the legacy ScopeFilter text shape that
          feature tests + VS Code's own counted filters use, and lets
          `getByText("Label (n)")` match (a child element would split the node
          and break that query). */}
      {opt.count === undefined ? opt.label : `${opt.label} (${opt.count})`}
    </button>
  );
}

export function Segmented<V extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "default",
  disabled = false,
  class: cls,
}: SegmentedProps<V>) {
  const move = (delta: number): void => {
    const i = options.findIndex((o) => o.value === value);
    if (i === -1) return;
    const next = (i + delta + options.length) % options.length;
    if (options[next].value !== value) onChange(options[next].value);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        if (options.length && options[0].value !== value) onChange(options[0].value);
        break;
      case "End": {
        e.preventDefault();
        const last = options[options.length - 1];
        if (last && last.value !== value) onChange(last.value);
        break;
      }
    }
  };

  return (
    <div
      class={cx(
        "vsc-segmented",
        size === "sm" && "vsc-segmented--sm",
        disabled && "is-disabled",
        cls,
      )}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
    >
      {options.map((opt) => (
        <Segment
          key={opt.value}
          opt={opt}
          active={value === opt.value}
          disabled={disabled}
          onSelect={() => {
            if (disabled || opt.value === value) return;
            onChange(opt.value);
          }}
          onKeyDown={disabled ? noop : onKeyDown}
        />
      ))}
    </div>
  );
}
