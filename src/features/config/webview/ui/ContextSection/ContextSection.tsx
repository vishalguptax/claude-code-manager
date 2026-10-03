/**
 * Sessions & context: how a session's context is compacted, what it keeps
 * between sessions, and how long transcripts live.
 *
 * The two number boxes keep a visible hint, because the valid range and the
 * default are what the user needs while typing; the toggles' background
 * lives behind InfoTips.
 */
import { useDebouncedCallback } from "../../../../../webview/shared/hooks";
import { Section } from "../../../../../webview/shared/ui";
import type { AccountData } from "../../../types";
import type { ConfigApi } from "../../api";
import { isSectionCollapsed, toggleSection } from "../../model";
import {
  NumberField,
  SETTING_WRITE_DEBOUNCE_MS,
  ToggleField,
  writeDefaultOn,
} from "../SettingFields";

export interface ContextSectionProps {
  data: AccountData;
  api: ConfigApi;
}

export function ContextSection({ data, api }: ContextSectionProps) {
  const s = data.settings;

  // Free-text fields write to the host on a debounce: the <TextField> mirror
  // already shows keystrokes instantly, so coalescing the host write to one
  // call ~350 ms after the user pauses removes the per-keystroke round trip
  // (postMessage → file write → echo) without any visible latency. A pending
  // write is flushed on unmount, so switching tabs mid-pause never drops it.
  const setRetention = useDebouncedCallback(
    (value: number | "") => api.setSetting("cleanupPeriodDays", value),
    SETTING_WRITE_DEBOUNCE_MS,
  );
  const setCompactWindow = useDebouncedCallback(
    (value: number | "") => api.setSetting("autoCompactWindow", value),
    SETTING_WRITE_DEBOUNCE_MS,
  );

  return (
    <Section
      id="context"
      title="Sessions & context"
      collapsed={isSectionCollapsed("context")}
      onToggle={toggleSection}
    >
      <ToggleField
        label="Auto-compact"
        info="Summarises earlier turns as the context window fills, instead of stopping."
        checked={s.autoCompactEnabled}
        onChange={(c) => writeDefaultOn(api, "autoCompactEnabled", c)}
      />
      <NumberField
        label="Compact at (tokens)"
        ariaLabel="Auto-compact window in tokens"
        hint="100,000 to 1,000,000. Blank lets Claude Code choose."
        value={s.autoCompactWindow}
        placeholder="Automatic"
        onValue={setCompactWindow}
      />
      <ToggleField
        label="File checkpoints"
        info="Keeps the file snapshots that /rewind restores."
        checked={s.fileCheckpointingEnabled}
        onChange={(c) => writeDefaultOn(api, "fileCheckpointingEnabled", c)}
      />
      <ToggleField
        label="Auto memory"
        info="Lets Claude keep notes about you and your projects between sessions."
        checked={s.autoMemoryEnabled}
        onChange={(c) => writeDefaultOn(api, "autoMemoryEnabled", c)}
      />
      <NumberField
        label="Transcript retention (days)"
        ariaLabel="Session retention in days"
        hint="Older transcripts are deleted. Blank keeps the default of 30."
        info="To keep transcripts for years, set a large number, such as 3650."
        value={s.cleanupPeriodDays}
        placeholder="30"
        onValue={setRetention}
      />
    </Section>
  );
}
