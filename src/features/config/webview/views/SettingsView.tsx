/**
 * Behavior settings section of the Config tab — model, tool-use
 * confirmation mode, reasoning effort, the boolean toggles, attribution
 * text, retention, and the open/reset actions. Every control posts a
 * validated message through the injected {@link ConfigApi}; the host
 * re-parses settings.json and pushes a fresh `accountData` payload, which
 * re-renders this view.
 */
import { Icon } from "../../../../webview/shared/ui";
import type { AccountData, PermissionDefaultMode } from "../../types";
import type { ConfigApi } from "../api";

/** Short purpose descriptions keyed by model family alias. */
const MODEL_DESCRIPTIONS: Record<string, string> = {
  default: "1M context · most capable",
  sonnet: "Balanced daily driver",
  haiku: "Fastest, lightest",
  opus: "Deepest reasoning",
};

interface ModelOption {
  value: string;
  label: string;
  desc: string;
}

const DEFAULT_MODE_OPTIONS: Array<{ value: PermissionDefaultMode; label: string; desc: string }> = [
  { value: "", label: "Use CLI default", desc: "Fall back to whatever Claude CLI decides" },
  { value: "default", label: "Prompt per tool call", desc: "Safest — confirm every non-allowed action" },
  { value: "acceptEdits", label: "Auto-approve file edits", desc: "Skip confirmation for Write / Edit operations" },
  { value: "plan", label: "Plan first", desc: "Claude plans before acting; requires explicit proceed" },
  { value: "bypassPermissions", label: "Bypass permissions (risky)", desc: "No prompts at all — full tool access" },
];

const EFFORT_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: "", label: "Default", desc: "Let Claude CLI pick the tier" },
  { value: "low", label: "Low", desc: "Fastest — minimal reasoning budget" },
  { value: "medium", label: "Medium", desc: "Balanced — default for most tasks" },
  { value: "high", label: "High", desc: "More thinking for harder problems" },
  { value: "xhigh", label: "XHigh", desc: "Deep reasoning — slower, more tokens" },
  { value: "max", label: "Max", desc: "Largest budget — slowest, most thorough" },
  { value: "auto", label: "Auto", desc: "CLI picks tier based on task" },
];

function buildEffortOptions(currentValue: string): Array<{ value: string; label: string; desc: string }> {
  if (!currentValue) return EFFORT_OPTIONS;
  if (EFFORT_OPTIONS.some((o) => o.value === currentValue)) return EFFORT_OPTIONS;
  // Unknown value — the CLI introduced a new tier we don't know yet.
  return [...EFFORT_OPTIONS, { value: currentValue, label: currentValue, desc: "New tier reported by Claude CLI" }];
}

function buildModelOptions(data: AccountData, currentModel: string): ModelOption[] {
  const latestOpus = data.availableModels.find((m) => m.alias === "opus" && m.isLatest);
  const defaultLabel = latestOpus ? `Default (${latestOpus.label})` : "Default";
  const options: ModelOption[] = [
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

export interface SettingsViewProps {
  data: AccountData;
  api: ConfigApi;
}

export function SettingsView({ data, api }: SettingsViewProps) {
  const s = data.settings;
  const currentModel = s.model || "default";
  const modelOptions = buildModelOptions(data, currentModel);
  const currentModelDesc = modelOptions.find((o) => o.value === currentModel)?.desc ?? "";
  const currentModeDesc =
    (DEFAULT_MODE_OPTIONS.find((o) => o.value === s.defaultMode) ?? DEFAULT_MODE_OPTIONS[0]).desc;
  const effortOptions = buildEffortOptions(s.effortLevel);
  const currentEffortDesc =
    effortOptions.find((o) => o.value === s.effortLevel)?.desc ?? EFFORT_OPTIONS[0].desc;

  return (
    <section class="acct-section">
      <header class="acct-section-header" data-section="settings">
        <h2 class="acct-section-title">
          <Icon name="settings" size={14} /> Behavior
        </h2>
      </header>
      <div class="acct-section-body">
        <div class="acct-field">
          <label class="acct-label" for="cfg-model">Model</label>
          <select
            id="cfg-model"
            class="acct-input"
            value={currentModel}
            onChange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              api.setModel(v === "default" ? "" : v);
            }}
          >
            {modelOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div class="acct-field-hint">{currentModelDesc}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-defaultmode">Tool-use confirmation</label>
          <select
            id="cfg-defaultmode"
            class="acct-input"
            value={s.defaultMode}
            onChange={(e) =>
              api.setSetting("permissions.defaultMode", (e.currentTarget as HTMLSelectElement).value)
            }
          >
            {DEFAULT_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div class="acct-field-hint">{currentModeDesc}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-effort">Reasoning effort</label>
          <select
            id="cfg-effort"
            class="acct-input"
            value={s.effortLevel}
            onChange={(e) =>
              api.setSetting("effortLevel", (e.currentTarget as HTMLSelectElement).value)
            }
          >
            {effortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div class="acct-field-hint">{currentEffortDesc}</div>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input
              type="checkbox"
              id="cfg-voice"
              checked={s.voiceEnabled}
              onChange={(e) => api.setVoiceEnabled((e.currentTarget as HTMLInputElement).checked)}
            />
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb" /></span>
            <span class="acct-toggle-text">Voice dictation</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input
              type="checkbox"
              id="cfg-coauthor"
              checked={s.includeCoAuthoredBy}
              onChange={(e) =>
                api.setSetting("includeCoAuthoredBy", (e.currentTarget as HTMLInputElement).checked)
              }
            />
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb" /></span>
            <span class="acct-toggle-text">Include "Co-authored-by: Claude" trailer in commits</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input
              type="checkbox"
              id="cfg-spinnertips"
              checked={s.spinnerTipsEnabled}
              onChange={(e) =>
                api.setSetting("spinnerTipsEnabled", (e.currentTarget as HTMLInputElement).checked)
              }
            />
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb" /></span>
            <span class="acct-toggle-text">Show "Tip:" lines under the spinner</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-commit">Commit attribution</label>
          <input
            type="text"
            class="acct-input"
            id="cfg-commit"
            value={s.commitAttribution}
            placeholder="e.g., Co-authored-by: Claude"
            onChange={(e) => api.setCommitAttribution((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-pr">PR attribution</label>
          <input
            type="text"
            class="acct-input"
            id="cfg-pr"
            value={s.prAttribution}
            placeholder="e.g., Generated with Claude Code"
            onChange={(e) => api.setPrAttribution((e.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-cleanup">Session retention (days)</label>
          <input
            type="number"
            class="acct-input"
            id="cfg-cleanup"
            min={0}
            step={1}
            value={s.cleanupPeriodDays > 0 ? String(s.cleanupPeriodDays) : ""}
            placeholder="Unlimited"
            onChange={(e) => {
              const val = (e.currentTarget as HTMLInputElement).value.trim();
              const n = val === "" ? 0 : Number.parseInt(val, 10);
              api.setSetting("cleanupPeriodDays", Number.isFinite(n) && n > 0 ? n : "");
            }}
          />
          <div class="acct-field-hint">Transcripts older than this auto-delete. Blank = no expiry.</div>
        </div>

        {s.statusLineCommand ? (
          <div class="acct-field">
            <label class="acct-label">Status line command</label>
            <code class="acct-code">{s.statusLineCommand}</code>
          </div>
        ) : null}

        <div class="acct-actions">
          <button class="btn" id="cfg-open-settings" onClick={() => api.openSettingsFile("global")}>
            <Icon name="external-link" size={14} /> Open settings.json
          </button>
          <button class="btn" onClick={() => api.launchSlash("/config")}>
            <Icon name="terminal" size={14} /> Open /config
          </button>
          <button
            class="btn"
            id="cfg-open-ext-settings"
            title="Open VS Code settings filtered to Claude Manager"
            onClick={() => api.openExtensionSettings()}
          >
            <Icon name="settings" size={14} /> Extension settings
          </button>
          <button
            class="btn del"
            id="cfg-reset-settings"
            title="Rename the global settings.json to a timestamped .bak and let Claude CLI regenerate a fresh one"
            onClick={() => api.resetSettings("global")}
          >
            <Icon name="refresh-cw" size={14} /> Reset settings
          </button>
        </div>

        <div class="acct-footnote">Changes apply to new Claude sessions.</div>
      </div>
    </section>
  );
}
