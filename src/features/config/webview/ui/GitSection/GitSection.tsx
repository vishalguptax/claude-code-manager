/**
 * Git & attribution: what Claude Code writes into the commits and pull
 * requests it authors, and whether it gets its built-in git instructions.
 */
import { useDebouncedCallback } from "../../../../../webview/shared/hooks";
import { Button, Field, Section } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import { isSectionCollapsed, toggleSection } from "../../model";
import {
  AttributionField,
  SETTING_WRITE_DEBOUNCE_MS,
  ToggleField,
  writeDefaultOn,
} from "../SettingFields";

export interface GitSectionProps {
  data: AccountData;
  api: ConfigApi;
}

export function GitSection({ data, api }: GitSectionProps) {
  const s = data.settings;
  const setCommitAttribution = useDebouncedCallback(
    api.setCommitAttribution,
    SETTING_WRITE_DEBOUNCE_MS,
  );
  const setPrAttribution = useDebouncedCallback(api.setPrAttribution, SETTING_WRITE_DEBOUNCE_MS);

  return (
    <Section
      id="git"
      title="Git & attribution"
      collapsed={isSectionCollapsed("git")}
      onToggle={toggleSection}
    >
      <AttributionField
        label="Commit attribution"
        what="commit trailer"
        info="The trailer Claude Code adds to the commits it writes."
        isSet={s.commitAttributionSet}
        value={s.commitAttribution}
        onMode={(m) => {
          // "default" removes the key (setSetting keeps the normal
          // remove-on-empty rule); "none" writes a literal "".
          if (m === "default") api.setSetting("attribution.commit", "");
          else if (m === "none") api.setCommitAttribution("");
          else api.setCommitAttribution(s.commitAttribution || " ");
        }}
        onText={setCommitAttribution}
      />
      <AttributionField
        label="PR attribution"
        what="PR line"
        info="The line Claude Code adds to the pull requests it opens."
        isSet={s.prAttributionSet}
        value={s.prAttribution}
        onMode={(m) => {
          if (m === "default") api.setSetting("attribution.pr", "");
          else if (m === "none") api.setPrAttribution("");
          else api.setPrAttribution(s.prAttribution || " ");
        }}
        onText={setPrAttribution}
      />
      <ToggleField
        label="Built-in git guidance"
        info="Off removes Claude Code's default commit and PR instructions from the system prompt."
        checked={s.includeGitInstructions}
        onChange={(c) => writeDefaultOn(api, "includeGitInstructions", c)}
      />

      {/* The legacy key still wins over the attribution fields above when it
          is set to false, so a user who edited it years ago would see two
          controls disagree. Surfaced as a notice with a one-click clear
          rather than resurrected as its own checkbox. */}
      {s.includeCoAuthoredBySet && !s.includeCoAuthoredBy ? (
        <Field
          class="cfg-deprecated"
          hint="This legacy key suppresses the commit trailer above. Claude Code has replaced it with the attribution fields."
        >
          <code class="cfg-code">includeCoAuthoredBy: false</code>
          <Button
            iconName="trash-2"
            title="Remove includeCoAuthoredBy from settings.json"
            onClick={() => api.setSetting("includeCoAuthoredBy", "")}
          >
            Remove legacy key
          </Button>
        </Field>
      ) : null}
    </Section>
  );
}
