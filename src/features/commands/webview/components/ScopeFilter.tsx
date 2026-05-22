/**
 * Scope filter bar for the commands list. Renders one button per available
 * scope (plus "All"); the plugin button only appears when plugin commands
 * exist. Counts come from the unfiltered command list.
 */
import { cx } from "../../../../webview/utils/classnames";
import type { ScopeFilter as ScopeFilterValue } from "../signals";

export interface ScopeFilterProps {
  active: ScopeFilterValue;
  total: number;
  builtinCount: number;
  projectCount: number;
  globalCount: number;
  pluginCount: number;
  onChange: (value: ScopeFilterValue) => void;
}

interface Option {
  value: ScopeFilterValue;
  label: string;
  count: number;
}

export function ScopeFilter(props: ScopeFilterProps) {
  const { active, total, builtinCount, projectCount, globalCount, pluginCount, onChange } = props;

  const options: Option[] = [
    { value: "all", label: "All", count: total },
    { value: "builtin", label: "Built-in", count: builtinCount },
    { value: "project", label: "Project", count: projectCount },
    { value: "global", label: "Global", count: globalCount },
  ];
  if (pluginCount > 0) {
    options.push({ value: "plugin", label: "Plugin", count: pluginCount });
  }

  return (
    <div class="scope-filter">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={cx("scope-btn", active === opt.value && "active")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label} ({opt.count})
        </button>
      ))}
    </div>
  );
}
