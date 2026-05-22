/**
 * Segmented control for filtering the agent list by model. Each button shows
 * a live count derived from `modelCounts`.
 */
import { cx } from "../../../../webview/utils/classnames";
import type { ModelFilter as ModelFilterValue } from "../signals";

export interface ModelFilterProps {
  value: ModelFilterValue;
  counts: { all: number; sonnet: number; opus: number; haiku: number };
  onChange: (value: ModelFilterValue) => void;
}

const OPTIONS: ReadonlyArray<{ value: ModelFilterValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

export function ModelFilter({ value, counts, onChange }: ModelFilterProps) {
  return (
    <div class="scope-filter">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={cx("scope-btn", value === opt.value && "active")}
          onClick={() => onChange(opt.value)}
        >
          {opt.label} ({counts[opt.value]})
        </button>
      ))}
    </div>
  );
}
