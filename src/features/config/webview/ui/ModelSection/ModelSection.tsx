/**
 * Model & reasoning: which model runs, how hard it thinks. The section most
 * people open Config for, so it leads the tab and starts expanded.
 */
import { Section } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import { buildEffortOptions, buildModelOptions } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";
import { SelectField, ToggleField, writeDefaultOn } from "../SettingFields";

export interface ModelSectionProps {
  data: AccountData;
  api: ConfigApi;
}

export function ModelSection({ data, api }: ModelSectionProps) {
  const s = data.settings;
  const currentModel = s.model || "default";
  const modelOptions = buildModelOptions(data, currentModel);
  const effortOptions = buildEffortOptions(s.effortLevel);
  const effortDesc =
    effortOptions.find((o) => o.value === s.effortLevel)?.desc ?? effortOptions[0].desc;

  return (
    <Section
      id="model"
      title="Model & reasoning"
      collapsed={isSectionCollapsed("model")}
      onToggle={toggleSection}
    >
      <SelectField
        label="Model"
        // The model id: which exact build an alias like "Opus" resolves to.
        hint={modelOptions.find((o) => o.value === currentModel)?.desc}
        value={currentModel}
        options={modelOptions.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => api.setModel(v === "default" ? "" : v)}
      />
      <SelectField
        label="Reasoning effort"
        info={effortDesc}
        value={s.effortLevel}
        options={effortOptions.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => api.setSetting("effortLevel", v)}
      />
      <ToggleField
        label="Extended thinking"
        info="Off turns thinking off for every session. On lets each model decide."
        checked={s.alwaysThinkingEnabled}
        onChange={(c) => writeDefaultOn(api, "alwaysThinkingEnabled", c)}
      />
    </Section>
  );
}
