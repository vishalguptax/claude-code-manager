/**
 * Segmented scope/category filter — a row of mutually-exclusive segments where
 * exactly one is active (e.g. All / Project / Global / Plugin). This is now a
 * thin alias over the shared <Segmented> primitive so there is ONE segmented
 * control in the webview: ScopeFilter keeps its named call-site ergonomics,
 * while the rendering, native look (subtle selected state, not primary blue),
 * and keyboard behaviour all come from Segmented.
 *
 * Counts ride in each segment's TOOLTIP rather than its label. Spelled inline
 * — "All (46) Project (13) Global (1) Plugin (32)" — four counted scopes need
 * roughly 370px of track, and the sidebar is about 300, so the control wrapped
 * onto a second line on every tab that has one. No layout rule fixes a set
 * that simply does not fit; the labels do fit comfortably, and the count is
 * detail you want on the scope you are considering, not on all four at once.
 * The list caption under the control already states the count for the scope in
 * effect.
 *
 * The option type is re-exported as `ScopeOption` so existing call sites keep
 * their import; it is structurally `SegmentedOption`.
 *
 * Generic over the option value type so feature unions (`"all" | "project" | …`)
 * flow through `onChange` without a cast.
 */
import { Segmented, type SegmentedOption } from "../Segmented";

export type ScopeOption<V extends string = string> = SegmentedOption<V>;

export interface ScopeFilterProps<V extends string = string> {
  value: V;
  options: ScopeOption<V>[];
  onChange: (value: V) => void;
  /** Accessible label for the group. */
  ariaLabel?: string;
  class?: string;
}

export function ScopeFilter<V extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  class: cls,
}: ScopeFilterProps<V>) {
  return (
    <Segmented
      value={value}
      options={options.map((o) =>
        o.count === undefined
          ? o
          : { value: o.value, label: o.label, title: `${o.label}: ${o.count}` },
      )}
      onChange={onChange}
      ariaLabel={ariaLabel ?? "Filter by scope"}
      class={cls ? `scope-filter ${cls}` : "scope-filter"}
    />
  );
}
