/**
 * Scope filter pills for the hooks list. Shows a count per scope and
 * highlights the active one. The Plugin pill only appears when at least
 * one plugin-declared hook exists, matching the v1 behaviour.
 */
import { cx } from "../../../../webview/shared/lib";
import type { HookScopeFilter } from "../signals";

export interface ScopeFilterProps {
  active: HookScopeFilter;
  total: number;
  globalCount: number;
  projectCount: number;
  localCount: number;
  pluginCount: number;
  onChange: (scope: HookScopeFilter) => void;
}

export function ScopeFilter(props: ScopeFilterProps) {
  const { active, total, globalCount, projectCount, localCount, pluginCount, onChange } = props;

  const pill = (scope: HookScopeFilter, label: string, count: number) => (
    <button
      type="button"
      class={cx("scope-btn", active === scope && "active")}
      onClick={() => onChange(scope)}
    >
      {`${label} (${count})`}
    </button>
  );

  return (
    <div class="scope-filter">
      {pill("all", "All", total)}
      {pill("global", "Global", globalCount)}
      {pill("project", "Project", projectCount)}
      {pill("local", "Local", localCount)}
      {pluginCount > 0 ? pill("plugin", "Plugin", pluginCount) : null}
    </div>
  );
}
