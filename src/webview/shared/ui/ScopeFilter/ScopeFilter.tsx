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

/**
 * One segment button. Hoisted to module scope so it is a single stable
 * component identity rather than a closure recreated inside the map on every
 * ScopeFilter render. Markup is identical to the inline version it replaced.
 */
function ScopeButton<V extends string>({
  opt,
  active,
  onChange,
}: {
  opt: ScopeOption<V>;
  active: boolean;
  onChange: (value: V) => void;
}) {
  return (
    <button
      type="button"
      class={cx("scope-btn", active && "active")}
      aria-pressed={active}
      onClick={() => onChange(opt.value)}
    >
      {opt.count === undefined ? opt.label : `${opt.label} (${opt.count})`}
    </button>
  );
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
        <ScopeButton key={opt.value} opt={opt} active={value === opt.value} onChange={onChange} />
      ))}
    </div>
  );
}
