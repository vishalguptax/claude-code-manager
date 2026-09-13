/**
 * Pure option builders for the Behavior settings dropdowns — model,
 * tool-use confirmation (defaultMode) and reasoning effort. Kept JSX-free so
 * the SettingsView component is purely presentational and these lists can be
 * unit-tested without rendering. The lists are shaped as `{ value, label, desc }`
 * so the view maps them onto the shared <Dropdown> options and the hint line.
 */
import type { AccountData, PermissionDefaultMode } from "../../types";
import { modelRecency } from "../../../../core/pricing";

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
  const raw = id.trim();
  const full = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(\[1m\])?$/i.exec(raw);
  if (full) {
    const family = capitalize(full[1]);
    const version = full[3] ? `${full[2]}.${full[3]}` : full[2];
    return `${family} ${version}${full[4] ? " · 1M context" : ""}`;
  }
  // Alias form, with or without the 1M-context suffix: "opus", "opus[1m]".
  // settings.json commonly holds these — they are what the CLI's own
  // picker writes — and without this branch the selected model rendered
  // as the raw string, so the one entry the user had chosen was the only
  // unreadable row in the list.
  const alias = /^([a-z]+)(\[1m\])?$/i.exec(raw);
  if (alias) return `${capitalize(alias[1])}${alias[2] ? " · 1M context" : ""}`;
  return raw;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Family token of a model id ("claude-opus-4-8" -> "opus"), or "". */
function modelFamily(id: string): string {
  return /^claude-([a-z]+)-/i.exec(id.trim())?.[1]?.toLowerCase() ?? "";
}

/** Split an alias-form model value into its alias and 1M-context flag. */
function parseAlias(value: string): { alias: string; long: boolean } | null {
  const m = /^([a-z]+)(\[1m\])?$/i.exec(value.trim());
  return m ? { alias: m[1].toLowerCase(), long: Boolean(m[2]) } : null;
}

/** One selectable option carrying a hint description. */
export interface SettingOption<V extends string = string> {
  value: V;
  label: string;
  desc: string;
}

// Descriptions are Claude Code's own, from the CLI's permission-mode
// documentation — not paraphrased from the value names.
export const DEFAULT_MODE_OPTIONS: Array<SettingOption<PermissionDefaultMode>> = [
  { value: "", label: "Use CLI default", desc: "Fall back to whatever Claude CLI decides" },
  { value: "default", label: "Prompt per tool call", desc: "Safest — confirm every non-allowed action" },
  { value: "acceptEdits", label: "Auto-approve file edits", desc: "Skip confirmation for Write / Edit operations" },
  { value: "auto", label: "Auto (classifier)", desc: "A model classifier approves or denies each permission prompt" },
  { value: "plan", label: "Plan first", desc: "Claude plans before acting; requires explicit proceed" },
  { value: "dontAsk", label: "Never ask", desc: "No prompts — anything not pre-approved is denied" },
  { value: "bypassPermissions", label: "Bypass permissions (risky)", desc: "No prompts at all — full tool access" },
];

export const EFFORT_OPTIONS: Array<SettingOption> = [
  { value: "", label: "Default", desc: "Let Claude CLI pick the tier" },
  { value: "low", label: "Low", desc: "Fastest — minimal reasoning budget" },
  { value: "medium", label: "Medium", desc: "Balanced — default for most tasks" },
  { value: "high", label: "High", desc: "More thinking for harder problems" },
  { value: "xhigh", label: "XHigh", desc: "Deep reasoning — slower, more tokens" },
  { value: "max", label: "Max", desc: "Largest budget — slowest, most thorough" },
];
// No "auto" tier: Claude Code accepts low | medium | high | xhigh | max
// and nothing else, so offering one wrote a value the CLI rejects. A
// user who already has an unrecognised tier set keeps seeing it —
// buildEffortOptions appends whatever is current.

/**
 * Effort options for the current value. If the CLI reports a tier we don't
 * know yet, append it so the dropdown can still show (and keep) the selection.
 */
/**
 * Built-in output styles. Users can add their own under
 * `~/.claude/output-styles/`, so an unrecognised current value is
 * appended rather than dropped (same rule as the effort picker).
 */
export const OUTPUT_STYLE_OPTIONS: Array<SettingOption> = [
  { value: "", label: "Default", desc: "Claude Code's standard engineering voice" },
  { value: "Explanatory", label: "Explanatory", desc: "Adds educational asides explaining the choices made" },
  { value: "Learning", label: "Learning", desc: "Asks you to write some of the code, and explains as it goes" },
];

export function buildOutputStyleOptions(currentValue: string): Array<SettingOption> {
  if (!currentValue) return OUTPUT_STYLE_OPTIONS;
  if (OUTPUT_STYLE_OPTIONS.some((o) => o.value === currentValue)) return OUTPUT_STYLE_OPTIONS;
  return [
    ...OUTPUT_STYLE_OPTIONS,
    { value: currentValue, label: currentValue, desc: "Custom output style from ~/.claude/output-styles/" },
  ];
}

/** Prompt-input key bindings. Claude Code accepts "default" and "vim". */
export const EDITOR_MODE_OPTIONS: Array<SettingOption> = [
  { value: "", label: "Default", desc: "Standard text input" },
  { value: "vim", label: "Vim", desc: "Vim key bindings, with normal and insert modes" },
];

export function buildEffortOptions(currentValue: string): Array<SettingOption> {
  if (!currentValue) return EFFORT_OPTIONS;
  if (EFFORT_OPTIONS.some((o) => o.value === currentValue)) return EFFORT_OPTIONS;
  return [...EFFORT_OPTIONS, { value: currentValue, label: currentValue, desc: "New tier reported by Claude CLI" }];
}

/**
 * Model options for the picker: the "default" entry, then one row per
 * model the user could plausibly choose, newest first.
 *
 * The CLI binary carries every model id it has ever known — on a current
 * install that is 22 entries, most of them retired (Sonnet 3.7, Haiku
 * 3.5, Opus 4/4.1) and unusable on a first-party account. Listing them
 * all buried the four or five real choices.
 *
 * The filter is deliberately not a hardcoded list of live models, which
 * would go stale on every release. A row is kept when it is:
 *
 *   - the newest of its family (`isLatest`) — the current lineup, and
 *     bound to the alias so it tracks future releases;
 *   - a version this account has actually run, per the usage stats —
 *     someone pinned to Opus 4.8 keeps seeing it;
 *   - the current selection, so the configured value is never hidden.
 *
 * Everything else is a version nobody here has used and cannot select
 * anyway.
 */
export function buildModelOptions(data: AccountData, currentModel: string): Array<SettingOption> {
  // The "Default" entry does NOT name a model: the account's recommended
  // default isn't readable locally (and differs per account/plan), so
  // claiming e.g. "Default (Opus 4.8)" was misleading — it showed the same
  // label for every account regardless of their real default.
  // Show what Default actually resolves to when the statusline knows the
  // running model; fall back to "(auto)" when it doesn't.
  //
  // Only when nothing is pinned, though. `activeModel` is the model Claude
  // Code is currently RUNNING, which with a pin in settings.json is just
  // that pin echoed back — so "Default (Opus 5 (1M context))" sat directly
  // above the pinned "Opus 5 · 1M context" row, two near-identical lines
  // where the label claimed Default resolves to the very thing the user
  // chose instead of it. With a pin we can say nothing true about what
  // Default would give, so we say nothing.
  const isPinned = Boolean(currentModel) && currentModel !== "default";
  const defaultLabel = isPinned
    ? "Default"
    : data.activeModel
      ? `Default (${data.activeModel})`
      : "Default (auto)";
  const options: Array<SettingOption> = [
    {
      value: "default",
      label: defaultLabel,
      desc: isPinned
        ? "Clear the pinned model and follow your account default"
        : MODEL_DESCRIPTIONS.default,
    },
  ];
  const seenValues = new Set<string>(["default"]);
  // Dedup on label too, not just value: the CLI scan can surface the same
  // version both dated and undated (e.g. "claude-opus-4-8" and
  // "claude-opus-4-8-20260514"), which render to the same "Opus 4.8" label
  // under two different values — that's the duplicate-option bug. First
  // occurrence wins (discovery lists the latest/alias form first).
  const seenLabels = new Set<string>();

  // Model ids this account has actually run. Usage ids are often dated
  // ("claude-haiku-4-5-20251001") while discovery yields the undated form,
  // so they are compared on family + version rather than as strings. A
  // plain prefix test looks right and is not: "claude-haiku-4" is a
  // prefix of "claude-haiku-4-5-20251001", which resurrected retired
  // Haiku 4 and Opus 4 rows on the strength of Haiku 4.5 usage.
  const used = (data.usage?.byModel ?? []).map((u) => ({
    family: modelFamily(u.model),
    rank: modelRecency(u.model),
  }));
  const hasBeenUsed = (id: string): boolean => {
    const family = modelFamily(id);
    const rank = modelRecency(id);
    if (!family || rank < 0) return false;
    return used.some((u) => u.family === family && u.rank === rank);
  };

  const rows: Array<SettingOption & { rank: number; family: string }> = [];
  for (const m of data.availableModels) {
    const value = m.isLatest ? m.alias : m.id;
    if (seenValues.has(value) || seenLabels.has(m.label)) continue;
    const keep = m.isLatest || value === currentModel || m.id === currentModel || hasBeenUsed(m.id);
    if (!keep) continue;
    seenValues.add(value);
    seenLabels.add(m.label);
    rows.push({
      value,
      label: m.label,
      desc: m.isLatest ? MODEL_DESCRIPTIONS[m.alias] ?? "" : "Pinned to this version",
      rank: modelRecency(m.id),
      family: m.family,
    });
  }

  if (currentModel && !seenValues.has(currentModel)) {
    // Usually an alias form such as "opus[1m]". Resolve it against the
    // discovered list so it reads "Opus 5 · 1M context" rather than the
    // raw id, and so it sorts beside its own family instead of landing
    // last — the configured model was the one unreadable row at the
    // bottom of the list.
    const parsed = parseAlias(currentModel);
    const base = parsed
      ? data.availableModels.find((m) => m.isLatest && m.alias === parsed.alias)
      : undefined;
    const label = base
      ? `${base.label}${parsed?.long ? " · 1M context" : ""}`
      : prettyModelLabel(currentModel);
    rows.push({
      value: currentModel,
      // Keep the raw id visible in the hint when we prettified it, so
      // the user can still see exactly what settings.json contains.
      label,
      desc: label === currentModel ? "" : currentModel,
      rank: base ? modelRecency(base.id) : -1,
      family: base?.family ?? parsed?.alias ?? "",
    });
  }

  // Newest first, family as the tiebreaker — the same ordering discovery
  // uses, reapplied because the current selection is inserted afterwards.
  rows.sort((a, b) => b.rank - a.rank || a.family.localeCompare(b.family));
  options.push(...rows.map(({ value, label, desc }) => ({ value, label, desc })));
  return options;
}
