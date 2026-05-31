/**
 * Segmented scope/category filter — a row of mutually-exclusive segments where
 * exactly one is active (e.g. All / Project / Global / Plugin). This is now a
 * thin alias over the shared <Segmented> primitive so there is ONE segmented
 * control in the webview: ScopeFilter keeps its named call-site ergonomics and
 * its count display, but the rendering, native look (subtle selected state, not
 * primary blue), and keyboard behaviour all come from Segmented.
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
      options={options}
      onChange={onChange}
      ariaLabel={ariaLabel ?? "Filter by scope"}
      class={cls ? `scope-filter ${cls}` : "scope-filter"}
    />
  );
}
