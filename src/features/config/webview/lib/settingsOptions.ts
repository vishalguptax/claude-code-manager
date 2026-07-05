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
  // "Default" means the CLI/account picks — we can't read the account's
  // recommended model locally, so don't claim a specific one here.
  default: "Let Claude pick for your account",
  fable: "Most capable — hardest reasoning",
  mythos: "Most capable — hardest reasoning",
  sonnet: "Balanced daily driver",
  haiku: "Fastest, lightest",
  opus: "Deep reasoning workhorse",
};

/**
 * Human label for a raw model id the discovery scan didn't surface —
 * e.g. a brand-new family or a variant suffix. "claude-fable-5[1m]"
 * renders as "Fable 5 · 1M context" instead of the raw id. Ids that
 * don't fit the claude-{family}-{version} shape pass through verbatim
 * so custom endpoints / router ids stay recognizable.
 */
export function prettyModelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(\[1m\])?$/i.exec(id.trim());
  if (!m) return id;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
  return `${family} ${version}${m[4] ? " · 1M context" : ""}`;
}

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
  // The "Default" entry does NOT name a model: the account's recommended
  // default isn't readable locally (and differs per account/plan), so
  // claiming e.g. "Default (Opus 4.8)" was misleading — it showed the same
  // label for every account regardless of their real default.
  // Show what Default actually resolves to when the statusline knows the
  // running model; fall back to "(auto)" when it doesn't.
  const defaultLabel = data.activeModel ? `Default (${data.activeModel})` : "Default (auto)";
  const options: Array<SettingOption> = [
    { value: "default", label: defaultLabel, desc: MODEL_DESCRIPTIONS.default },
  ];
  const seenValues = new Set<string>(["default"]);
  // Dedup on label too, not just value: the CLI scan can surface the same
  // version both dated and undated (e.g. "claude-opus-4-8" and
  // "claude-opus-4-8-20260514"), which render to the same "Opus 4.8" label
  // under two different values — that's the duplicate-option bug. First
  // occurrence wins (discovery lists the latest/alias form first).
  const seenLabels = new Set<string>();
  for (const m of data.availableModels) {
    const value = m.isLatest ? m.alias : m.id;
    if (seenValues.has(value) || seenLabels.has(m.label)) continue;
    seenValues.add(value);
    seenLabels.add(m.label);
    options.push({ value, label: m.label, desc: m.isLatest ? MODEL_DESCRIPTIONS[m.alias] ?? "" : "Pinned" });
  }
  if (currentModel && !seenValues.has(currentModel)) {
    const label = prettyModelLabel(currentModel);
    // Keep the raw id visible in the hint when we prettified it, so
    // the user can still see exactly what settings.json contains.
    options.push({
      value: currentModel,
      label,
      desc: label === currentModel ? "" : currentModel,
    });
  }
  return options;
}
