/**
 * Segmented scope/category filter — a row of mutually-exclusive buttons where
 * exactly one is active (e.g. All / Project / Global / Plugin, or the agent
 * model toggle). Generalises the four near-identical per-feature copies
 * (sessions, mcp, hooks, commands, agents) into one shared control.
 *
 * Each option may carry a `count` rendered as a trailing number; callers that
 * don't want counts simply omit it. The caller decides which options appear
 * (e.g. hiding the Plugin segment when no plugin items exist) — this component
 * renders exactly what it is given, in order.
 *
 * Generic over the option value type so feature unions (`"all" | "project" |
 * …`) flow through `onChange` without a cast.
 */
import { cx } from "../../lib";

export interface ScopeOption<V extends string = string> {
  value: V;
  label: string;
  /** Optional trailing count shown after the label. */
  count?: number;
}

export interface ScopeFilterProps<V extends string = string> {
  value: V;
  options: ScopeOption<V>[];
  onChange: (value: V) => void;
  class?: string;
}

export function ScopeFilter<V extends string = string>({
  value,
  options,
  onChange,
  class: cls,
}: ScopeFilterProps<V>) {
  return (
    <div class={cx("scope-filter", cls)} role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={cx("scope-btn", value === opt.value && "active")}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.count === undefined ? opt.label : `${opt.label} (${opt.count})`}
        </button>
      ))}
    </div>
  );
}
