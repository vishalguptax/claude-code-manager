/**
 * Settings section of the Config tab.
 *
 * Controls are grouped by the question they answer rather than listed in
 * one run: how Claude thinks, what it is allowed to do, how much history
 * it keeps, what it writes into git, and how the terminal looks. The
 * previous flat list mixed a model picker, a git trailer and a spinner
 * toggle as peers, which left no way to scan for the one control you
 * came for.
 *
 * Scope is deliberate. Claude Code has roughly two hundred settings keys,
 * and the large majority are organization policy that belongs in
 * managed-settings.json — surfacing those here would invite users to set
 * values their org intends to own. What is offered is the personal set: a
 * key is here only if an individual would reasonably change it for
 * themselves.
 *
 * Every control posts a validated message through the injected
 * {@link ConfigApi}; the host re-parses settings.json and pushes a fresh
 * `accountData` payload, which re-renders this view. Booleans that Claude
 * Code defaults ON are written as an explicit `false` and removed again
 * when re-enabled, so the file only ever carries what differs from
 * stock.
 */
import type { ComponentChildren } from "preact";
import { isSectionCollapsed, toggleSection } from "../../model";
import { useDebouncedCallback } from "../../../../../webview/shared/hooks";
import {
  Button,
  Checkbox,
  Dropdown,
  SectionHeader,
  TextField,
} from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import {
  buildEffortOptions,
  buildModelOptions,
  buildOutputStyleOptions,
  DEFAULT_MODE_OPTIONS,
  EDITOR_MODE_OPTIONS,
} from "../../lib";

export interface SettingsViewProps {
  data: AccountData;
  api: ConfigApi;
}

/**
 * Debounce window for free-text setting writes. Long enough to coalesce a burst
 * of typing into one host write, short enough that a save feels immediate after
 * the user pauses.
 */
const SETTING_WRITE_DEBOUNCE_MS = 350;

/** A labelled group of related controls inside the settings section. */
function Group({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="cfg-group">
      <h3 class="cfg-group-title">{title}</h3>
      {children}
    </div>
  );
}

/** The three states `attribution.commit` / `attribution.pr` can hold. */
type AttributionMode = "default" | "none" | "custom";

const ATTRIBUTION_MODES = [
  { value: "default", label: "Claude Code default" },
  { value: "none", label: "Add nothing" },
  { value: "custom", label: "Custom text" },
];

function attributionMode(isSet: boolean, value: string): AttributionMode {
  if (!isSet) return "default";
  return value === "" ? "none" : "custom";
}

/**
 * An attribution key as a mode picker plus a text box.
 *
 * A bare text field cannot express this setting. Claude Code reads an
 * absent key as "add my default trailer" and a present-but-empty key as
 * "add nothing" — opposite instructions that both render as an empty
 * box. Worse, clearing the box removed the key, so a user who had
 * deliberately set "" (this profile has `attribution: {"pr": ""}`) lost
 * that the moment they typed in the field and changed their mind.
 */
function AttributionField({
  label,
  what,
  isSet,
  value,
  onMode,
  onText,
}: {
  label: string;
  what: string;
  isSet: boolean;
  value: string;
  onMode: (mode: AttributionMode) => void;
  onText: (text: string) => void;
}) {
  const mode = attributionMode(isSet, value);
  const hint =
    mode === "none"
      ? `No ${what} is added.`
      : mode === "custom"
        ? `Your own ${what}.`
        : `Claude Code adds its own ${what}.`;
  return (
    <div class="field">
      <label class="field-label">{label}</label>
      <Dropdown
        value={mode}
        ariaLabel={label}
        options={ATTRIBUTION_MODES}
        onChange={(v) => onMode(v as AttributionMode)}
      />
      {mode === "custom" ? (
        <TextField
          ariaLabel={`${label} text`}
          value={value}
          placeholder={`e.g., ${what}`}
          onInput={onText}
        />
      ) : null}
      <div class="field-hint">{hint}</div>
    </div>
  );
}

/** A checkbox row with an explanatory line beneath it. */
function Toggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="field">
      <Checkbox checked={checked} label={label} onChange={onChange} />
      <div class="field-hint">{hint}</div>
    </div>
  );
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
  const outputStyleOptions = buildOutputStyleOptions(s.outputStyle);
  const currentStyleDesc =
    outputStyleOptions.find((o) => o.value === s.outputStyle)?.desc ?? outputStyleOptions[0].desc;
  const retentionValue = s.cleanupPeriodDays > 0 ? String(s.cleanupPeriodDays) : "";
  const compactWindowValue = s.autoCompactWindow > 0 ? String(s.autoCompactWindow) : "";

  // Free-text fields write to the host on a debounce: the <TextField> mirror
  // already shows keystrokes instantly, so coalescing the host write to one
  // call ~350 ms after the user pauses removes the per-keystroke round trip
  // (postMessage → file write → echo) without any visible latency. A pending
  // write is flushed on unmount, so switching tabs mid-pause never drops it.
  const setCommitAttribution = useDebouncedCallback(api.setCommitAttribution, SETTING_WRITE_DEBOUNCE_MS);
  const setPrAttribution = useDebouncedCallback(api.setPrAttribution, SETTING_WRITE_DEBOUNCE_MS);
  const setRetention = useDebouncedCallback(
    (value: number | "") => api.setSetting("cleanupPeriodDays", value),
    SETTING_WRITE_DEBOUNCE_MS,
  );
  const setCompactWindow = useDebouncedCallback(
    (value: number | "") => api.setSetting("autoCompactWindow", value),
    SETTING_WRITE_DEBOUNCE_MS,
  );

  // A key Claude Code defaults ON is stored only when turned OFF: writing
  // `true` back would leave a redundant line in settings.json that looks
  // like an intentional override. "" removes the key (see writeSettingsValue).
  const setDefaultOn = (key: string, enabled: boolean): void =>
    api.setSetting(key, enabled ? "" : false);

  return (
    <section class="section">
      <SectionHeader
        id="settings"
        title="Settings"
        icon="settings"
        collapsed={isSectionCollapsed("settings")}
        onToggle={toggleSection}
      />
      {isSectionCollapsed("settings") ? null : (
        <div class="section-body">
          <Group title="Model &amp; reasoning">
            <div class="field">
              <label class="field-label">Model</label>
              <Dropdown
                value={currentModel}
                ariaLabel="Model"
                options={modelOptions.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => api.setModel(v === "default" ? "" : v)}
              />
              <div class="field-hint">{currentModelDesc}</div>
            </div>

            <div class="field">
              <label class="field-label">Reasoning effort</label>
              <Dropdown
                value={s.effortLevel}
                ariaLabel="Reasoning effort"
                options={effortOptions.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => api.setSetting("effortLevel", v)}
              />
              <div class="field-hint">{currentEffortDesc}</div>
            </div>

            <Toggle
              checked={s.alwaysThinkingEnabled}
              label="Extended thinking"
              hint="Off disables thinking for every session. On lets each model decide."
              onChange={(c) => setDefaultOn("alwaysThinkingEnabled", c)}
            />
          </Group>

          <Group title="Permissions &amp; safety">
            <div class="field">
              <label class="field-label">Tool-use confirmation</label>
              <Dropdown
                value={s.defaultMode}
                ariaLabel="Tool-use confirmation"
                options={DEFAULT_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => api.setSetting("permissions.defaultMode", v)}
              />
              <div class="field-hint">{currentModeDesc}</div>
            </div>

            <Toggle
              checked={s.sandboxEnabled}
              label="Sandbox Bash commands"
              hint="Isolates shell commands from your filesystem and network. macOS, Linux and WSL2."
              onChange={(c) => api.setSetting("sandbox.enabled", c ? true : "")}
            />

            <Toggle
              checked={s.disableBypassPermissionsMode}
              label="Block bypass-permissions mode"
              hint="Prevents any session from entering the mode that skips every prompt."
              onChange={(c) =>
                api.setSetting("permissions.disableBypassPermissionsMode", c ? true : "")
              }
            />
          </Group>

          <Group title="Context &amp; sessions">
            <Toggle
              checked={s.autoCompactEnabled}
              label="Auto-compact"
              hint="Summarises earlier turns as the context window fills, instead of stopping."
              onChange={(c) => setDefaultOn("autoCompactEnabled", c)}
            />

            <div class="field">
              <label class="field-label">Compact at (tokens)</label>
              <TextField
                ariaLabel="Auto-compact window in tokens"
                value={compactWindowValue}
                placeholder="Automatic"
                onInput={(v) => {
                  const val = v.trim();
                  const n = val === "" ? 0 : Number.parseInt(val, 10);
                  setCompactWindow(Number.isFinite(n) && n > 0 ? n : "");
                }}
              />
              <div class="field-hint">
                How full the context gets before compacting. Blank lets Claude Code
                choose; the CLI accepts 100,000–1,000,000.
              </div>
            </div>

            <Toggle
              checked={s.fileCheckpointingEnabled}
              label="File checkpoints"
              hint="Keeps the file snapshots that /rewind restores."
              onChange={(c) => setDefaultOn("fileCheckpointingEnabled", c)}
            />

            <Toggle
              checked={s.autoMemoryEnabled}
              label="Auto memory"
              hint="Lets Claude record notes about you and your projects between sessions."
              onChange={(c) => setDefaultOn("autoMemoryEnabled", c)}
            />

            <div class="field">
              <label class="field-label">Transcript retention (days)</label>
              <TextField
                ariaLabel="Session retention in days"
                value={retentionValue}
                placeholder="30"
                onInput={(v) => {
                  const val = v.trim();
                  const n = val === "" ? 0 : Number.parseInt(val, 10);
                  setRetention(Number.isFinite(n) && n > 0 ? n : "");
                }}
              />
              <div class="field-hint">
                Transcripts older than this auto-delete. Blank uses Claude Code's
                default of 30 days — to keep them longer, set a large number
                (e.g. 3650 for ~10 years).
              </div>
            </div>
          </Group>

          <Group title="Git &amp; attribution">
            <AttributionField
              label="Commit attribution"
              what="commit trailer"
              isSet={s.commitAttributionSet}
              value={s.commitAttribution}
              onMode={(m) => {
                // "default" removes the key (setSetting keeps the normal
                // remove-on-empty rule); "none" writes a literal "".
                if (m === "default") api.setSetting("attribution.commit", "");
                else if (m === "none") api.setCommitAttribution("");
                else api.setCommitAttribution(s.commitAttribution || " ");
              }}
              onText={(v) => setCommitAttribution(v)}
            />

            <AttributionField
              label="PR attribution"
              what="PR line"
              isSet={s.prAttributionSet}
              value={s.prAttribution}
              onMode={(m) => {
                if (m === "default") api.setSetting("attribution.pr", "");
                else if (m === "none") api.setPrAttribution("");
                else api.setPrAttribution(s.prAttribution || " ");
              }}
              onText={(v) => setPrAttribution(v)}
            />

            <Toggle
              checked={s.includeGitInstructions}
              label="Built-in git guidance"
              hint="Off removes Claude Code's default commit and PR instructions from the system prompt."
              onChange={(c) => setDefaultOn("includeGitInstructions", c)}
            />

            {/* The legacy key still wins over the attribution fields above when
                it is set to false, so a user who edited it years ago would see
                two controls disagree. Surfaced as a notice with a one-click
                clear rather than resurrected as its own checkbox. */}
            {s.includeCoAuthoredBySet && !s.includeCoAuthoredBy ? (
              <div class="field cfg-deprecated">
                <div class="field-hint">
                  <code class="cfg-code">includeCoAuthoredBy: false</code> is set and
                  suppresses the trailer above. Claude Code has replaced it with the
                  attribution fields.
                </div>
                <Button
                  iconName="trash-2"
                  title="Remove includeCoAuthoredBy from settings.json"
                  onClick={() => api.setSetting("includeCoAuthoredBy", "")}
                >
                  Remove legacy key
                </Button>
              </div>
            ) : null}
          </Group>

          <Group title="Interface">
            <div class="field">
              <label class="field-label">Output style</label>
              <Dropdown
                value={s.outputStyle}
                ariaLabel="Output style"
                options={outputStyleOptions.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => api.setSetting("outputStyle", v)}
              />
              <div class="field-hint">{currentStyleDesc}</div>
            </div>

            <div class="field">
              <label class="field-label">Editor mode</label>
              <Dropdown
                value={s.editorMode === "vim" ? "vim" : ""}
                ariaLabel="Editor mode"
                options={EDITOR_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                onChange={(v) => api.setSetting("editorMode", v)}
              />
              <div class="field-hint">Key bindings for the prompt input.</div>
            </div>

            <Toggle
              checked={s.verbose}
              label="Verbose tool output"
              hint="Shows full command output instead of truncated summaries."
              onChange={(c) => api.setSetting("verbose", c ? true : "")}
            />

            <Toggle
              checked={s.spinnerTipsEnabled}
              label='"Tip:" lines under the spinner'
              hint="Rotating hints shown while Claude works."
              onChange={(c) => setDefaultOn("spinnerTipsEnabled", c)}
            />

            <Toggle
              checked={s.voiceEnabled}
              label="Voice dictation"
              hint="Dictate prompts instead of typing them."
              onChange={(c) => api.setVoiceEnabled(c)}
            />

            {s.statusLineCommand ? (
              <div class="field">
                <label class="field-label">Status line command</label>
                {/* Read-only display of the configured command, NOT an editable
                    field — rendered as a code block so users don't mistake it for
                    an input. `title` carries the full value for hover discovery
                    when a long command scrolls horizontally. */}
                <code class="cfg-code code-readonly" title={s.statusLineCommand}>
                  {s.statusLineCommand}
                </code>
              </div>
            ) : null}
          </Group>

          <div class="actions-row">
            <Button iconName="external-link" onClick={() => api.openSettingsFile("global")}>
              Open settings.json
            </Button>
            <Button iconName="terminal" onClick={() => api.launchSlash("/config")}>
              Open /config
            </Button>
            <Button
              iconName="settings"
              title="Open VS Code settings filtered to Claude Code Manager"
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

          <div class="cfg-footnote">Changes apply to new Claude sessions.</div>
        </div>
      )}
    </section>
  );
}
