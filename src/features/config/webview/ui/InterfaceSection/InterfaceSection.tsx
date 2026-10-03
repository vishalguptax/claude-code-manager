/**
 * Interface: how Claude Code's terminal UI looks and takes input.
 */
import { Field, Section } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import { buildOutputStyleOptions, EDITOR_MODE_OPTIONS } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";
import { SelectField, ToggleField, writeDefaultOn } from "../SettingFields";

export interface InterfaceSectionProps {
  data: AccountData;
  api: ConfigApi;
}

export function InterfaceSection({ data, api }: InterfaceSectionProps) {
  const s = data.settings;
  const styleOptions = buildOutputStyleOptions(s.outputStyle);
  const styleDesc =
    styleOptions.find((o) => o.value === s.outputStyle)?.desc ?? styleOptions[0].desc;

  return (
    <Section
      id="interface"
      title="Interface"
      collapsed={isSectionCollapsed("interface")}
      onToggle={toggleSection}
    >
      <SelectField
        label="Output style"
        info={styleDesc}
        value={s.outputStyle}
        options={styleOptions.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => api.setSetting("outputStyle", v)}
      />
      <SelectField
        label="Editor mode"
        info="Key bindings for the prompt input."
        value={s.editorMode === "vim" ? "vim" : ""}
        options={EDITOR_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => api.setSetting("editorMode", v)}
      />
      <ToggleField
        label="Verbose tool output"
        info="Shows full command output instead of truncated summaries."
        checked={s.verbose}
        onChange={(c) => api.setSetting("verbose", c ? true : "")}
      />
      <ToggleField
        label='"Tip:" lines under the spinner'
        checked={s.spinnerTipsEnabled}
        onChange={(c) => writeDefaultOn(api, "spinnerTipsEnabled", c)}
      />
      <ToggleField
        label="Voice dictation"
        checked={s.voiceEnabled}
        onChange={(c) => api.setVoiceEnabled(c)}
      />
      {s.statusLineCommand ? (
        <Field label="Status line command">
          {/* Read-only display of the configured command, NOT an editable
              field: rendered as a code block so users don't mistake it for an
              input. `title` carries the full value for hover discovery when a
              long command scrolls horizontally. */}
          <code class="cfg-code code-readonly" title={s.statusLineCommand}>
            {s.statusLineCommand}
          </code>
        </Field>
      ) : null}
    </Section>
  );
}
