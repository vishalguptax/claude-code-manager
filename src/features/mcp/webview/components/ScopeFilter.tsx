/**
 * Scope filter buttons for the MCP list. The plugin button only appears when
 * at least one plugin-supplied server exists, mirroring the vanilla behaviour.
 */
import { cx } from "../../../../webview/shared/lib";
import type { McpScopeFilter } from "../signals";

export interface ScopeFilterProps {
  active: McpScopeFilter;
  total: number;
  counts: { project: number; global: number; plugin: number };
  onChange: (scope: McpScopeFilter) => void;
}

interface Choice {
  value: McpScopeFilter;
  label: string;
}

export function ScopeFilter({ active, total, counts, onChange }: ScopeFilterProps) {
  const choices: Choice[] = [
    { value: "all", label: `All (${total})` },
    { value: "project", label: `Project (${counts.project})` },
    { value: "global", label: `Global (${counts.global})` },
  ];
  if (counts.plugin > 0) {
    choices.push({ value: "plugin", label: `Plugin (${counts.plugin})` });
  }

  return (
    <div class="scope-filter">
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          class={cx("scope-btn", active === c.value && "active")}
          onClick={() => onChange(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
