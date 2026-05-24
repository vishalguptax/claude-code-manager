/**
 * Behavior settings section of the Config tab — model, tool-use
 * confirmation mode, reasoning effort, the boolean toggles, attribution
 * text, retention, and the open/reset actions. Every control posts a
 * validated message through the injected {@link ConfigApi}; the host
 * re-parses settings.json and pushes a fresh `accountData` payload, which
 * re-renders this view.
 *
 * All controls are shared-library components: the three pickers use the
 * native-look <Dropdown> (replacing the last raw <select> in the app), the
 * toggles use <Checkbox>, the text/number fields use <TextField>, and the
 * actions use <Button> (the reset uses the destructive `danger` variant).
 * Option lists and their hint descriptions come from the JSX-free builders
 * in the slice's lib segment.
 */
import { Button, Checkbox, Dropdown, Icon, TextField } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import { buildEffortOptions, buildModelOptions, DEFAULT_MODE_OPTIONS } from "../../lib";

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
    effortOptions.find((o) => o.value === s.effortLevel)?.desc ?? effortOptions[0].desc;
  const retentionValue = s.cleanupPeriodDays > 0 ? String(s.cleanupPeriodDays) : "";

  return (
    <section class="acct-section">
      <header class="acct-section-header" data-section="settings">
        <h2 class="acct-section-title">
          <Icon name="settings" size={14} /> Behavior
        </h2>
      </header>
      <div class="acct-section-body">
        <div class="acct-field">
          <label class="acct-label">Model</label>
          <Dropdown
            value={currentModel}
            ariaLabel="Model"
            options={modelOptions.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => api.setModel(v === "default" ? "" : v)}
          />
          <div class="acct-field-hint">{currentModelDesc}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label">Tool-use confirmation</label>
          <Dropdown
            value={s.defaultMode}
            ariaLabel="Tool-use confirmation"
            options={DEFAULT_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => api.setSetting("permissions.defaultMode", v)}
          />
          <div class="acct-field-hint">{currentModeDesc}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label">Reasoning effort</label>
          <Dropdown
            value={s.effortLevel}
            ariaLabel="Reasoning effort"
            options={effortOptions.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => api.setSetting("effortLevel", v)}
          />
          <div class="acct-field-hint">{currentEffortDesc}</div>
        </div>

        <div class="acct-field">
          <Checkbox
            checked={s.voiceEnabled}
            label="Voice dictation"
            onChange={(c) => api.setVoiceEnabled(c)}
          />
        </div>

        <div class="acct-field">
          <Checkbox
            checked={s.includeCoAuthoredBy}
            label='Include "Co-authored-by: Claude" trailer in commits'
            onChange={(c) => api.setSetting("includeCoAuthoredBy", c)}
          />
        </div>

        <div class="acct-field">
          <Checkbox
            checked={s.spinnerTipsEnabled}
            label='Show "Tip:" lines under the spinner'
            onChange={(c) => api.setSetting("spinnerTipsEnabled", c)}
          />
        </div>

        <div class="acct-field">
          <label class="acct-label">Commit attribution</label>
          <TextField
            ariaLabel="Commit attribution"
            value={s.commitAttribution}
            placeholder="e.g., Co-authored-by: Claude"
            onInput={(v) => api.setCommitAttribution(v)}
          />
        </div>

        <div class="acct-field">
          <label class="acct-label">PR attribution</label>
          <TextField
            ariaLabel="PR attribution"
            value={s.prAttribution}
            placeholder="e.g., Generated with Claude Code"
            onInput={(v) => api.setPrAttribution(v)}
          />
        </div>

        <div class="acct-field">
          <label class="acct-label">Session retention (days)</label>
          <TextField
            ariaLabel="Session retention in days"
            value={retentionValue}
            placeholder="Unlimited"
            onInput={(v) => {
              const val = v.trim();
              const n = val === "" ? 0 : Number.parseInt(val, 10);
              api.setSetting("cleanupPeriodDays", Number.isFinite(n) && n > 0 ? n : "");
            }}
          />
          <div class="acct-field-hint">Transcripts older than this auto-delete. Blank = no expiry.</div>
        </div>

        {s.statusLineCommand ? (
          <div class="acct-field">
            <label class="acct-label">Status line command</label>
            {/* Read-only display of the configured command, NOT an editable
                field — rendered as a code block so users don't mistake it for
                an input. `title` carries the full value for hover discovery
                when a long command scrolls horizontally. */}
            <code class="acct-code code-readonly" title={s.statusLineCommand}>
              {s.statusLineCommand}
            </code>
          </div>
        ) : null}

        <div class="acct-actions">
          <Button iconName="external-link" onClick={() => api.openSettingsFile("global")}>
            Open settings.json
          </Button>
          <Button iconName="terminal" onClick={() => api.launchSlash("/config")}>
            Open /config
          </Button>
          <Button
            iconName="settings"
            title="Open VS Code settings filtered to Claude Manager"
            onClick={() => api.openExtensionSettings()}
          >
            Extension settings
          </Button>
          <Button
            variant="danger"
            iconName="refresh-cw"
            title="Rename the global settings.json to a timestamped .bak and let Claude CLI regenerate a fresh one"
            onClick={() => api.resetSettings("global")}
          >
            Reset settings
          </Button>
        </div>

        <div class="acct-footnote">Changes apply to new Claude sessions.</div>
      </div>
    </section>
  );
}
