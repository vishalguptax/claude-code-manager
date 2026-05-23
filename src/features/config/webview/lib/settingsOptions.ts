/**
 * Pure option builders for the Behavior settings dropdowns — model,
 * tool-use confirmation (defaultMode) and reasoning effort. Kept JSX-free so
 * the SettingsView component is purely presentational and these lists can be
 * unit-tested without rendering. The lists are shaped as `{ value, label, desc }`
 * so the view maps them onto the shared <Dropdown> options and the hint line.
 */
import type { AccountData, PermissionDefaultMode } from "../../types";

/** Short purpose descriptions keyed by model family alias. */
export const MODEL_DESCRIPTIONS: Record<string, string> = {
  default: "1M context · most capable",
  sonnet: "Balanced daily driver",
  haiku: "Fastest, lightest",
  opus: "Deepest reasoning",
};

/** One selectable option carrying a hint description. */
export interface SettingOption<V extends string = string> {
  value: V;
  label: string;
  desc: string;
}

export const DEFAULT_MODE_OPTIONS: Array<SettingOption<PermissionDefaultMode>> = [
  { value: "", label: "Use CLI default", desc: "Fall back to whatever Claude CLI decides" },
  { value: "default", label: "Prompt per tool call", desc: "Safest — confirm every non-allowed action" },
  { value: "acceptEdits", label: "Auto-approve file edits", desc: "Skip confirmation for Write / Edit operations" },
  { value: "plan", label: "Plan first", desc: "Claude plans before acting; requires explicit proceed" },
  { value: "bypassPermissions", label: "Bypass permissions (risky)", desc: "No prompts at all — full tool access" },
];

export const EFFORT_OPTIONS: Array<SettingOption> = [
  { value: "", label: "Default", desc: "Let Claude CLI pick the tier" },
  { value: "low", label: "Low", desc: "Fastest — minimal reasoning budget" },
  { value: "medium", label: "Medium", desc: "Balanced — default for most tasks" },
  { value: "high", label: "High", desc: "More thinking for harder problems" },
  { value: "xhigh", label: "XHigh", desc: "Deep reasoning — slower, more tokens" },
  { value: "max", label: "Max", desc: "Largest budget — slowest, most thorough" },
  { value: "auto", label: "Auto", desc: "CLI picks tier based on task" },
];

/**
 * Effort options for the current value. If the CLI reports a tier we don't
 * know yet, append it so the dropdown can still show (and keep) the selection.
 */
export function buildEffortOptions(currentValue: string): Array<SettingOption> {
  if (!currentValue) return EFFORT_OPTIONS;
  if (EFFORT_OPTIONS.some((o) => o.value === currentValue)) return EFFORT_OPTIONS;
  return [...EFFORT_OPTIONS, { value: currentValue, label: currentValue, desc: "New tier reported by Claude CLI" }];
}

/**
 * Model options from the available-models list, with a synthetic "default"
 * entry first and any unknown current selection appended so it never drops.
 */
export function buildModelOptions(data: AccountData, currentModel: string): Array<SettingOption> {
  const latestOpus = data.availableModels.find((m) => m.alias === "opus" && m.isLatest);
  const defaultLabel = latestOpus ? `Default (${latestOpus.label})` : "Default";
  const options: Array<SettingOption> = [
    { value: "default", label: defaultLabel, desc: MODEL_DESCRIPTIONS.default },
  ];
  const seen = new Set<string>(["default"]);
  for (const m of data.availableModels) {
    const value = m.isLatest ? m.alias : m.id;
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: m.label, desc: m.isLatest ? MODEL_DESCRIPTIONS[m.alias] ?? "" : "Pinned" });
  }
  if (currentModel && !seen.has(currentModel)) {
    options.push({ value: currentModel, label: currentModel, desc: "" });
  }
  return options;
}
