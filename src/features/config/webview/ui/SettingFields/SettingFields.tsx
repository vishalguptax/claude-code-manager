/**
 * The field shapes every Config section is built from: a select, a toggle, a
 * number box, and the commit/PR attribution picker.
 *
 * One rule runs through all of them. A line of text stays on screen only when
 * the user needs it while choosing (a valid range, a default, which mode is in
 * force); background on what a setting does goes behind an InfoTip. The tab
 * used to put a sentence under every control, and twenty of those read as a
 * page of prose with the controls lost inside it.
 */
import type { ConfigApi } from "../../api";
import {
  Checkbox,
  Dropdown,
  type DropdownOption,
  Field,
  InfoTip,
  TextField,
} from "../../../../../webview/shared/ui";

/**
 * Debounce window for free-text setting writes. Long enough to coalesce a burst
 * of typing into one host write, short enough that a save feels immediate after
 * the user pauses.
 */
export const SETTING_WRITE_DEBOUNCE_MS = 350;

/**
 * Write a key Claude Code defaults ON. It is stored only when turned OFF:
 * writing `true` back would leave a redundant line in settings.json that looks
 * like an intentional override. "" removes the key (see writeSettingsValue).
 */
export function writeDefaultOn(api: ConfigApi, key: string, enabled: boolean): void {
  api.setSetting(key, enabled ? "" : false);
}

export function SelectField({
  label,
  info,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  info?: string;
  hint?: string;
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} info={info} hint={hint}>
      <Dropdown value={value} ariaLabel={label} options={options} onChange={onChange} />
    </Field>
  );
}

/** A checkbox row, its explanation behind an InfoTip rather than under it. */
export function ToggleField({
  label,
  info,
  checked,
  onChange,
}: {
  label: string;
  info?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div class="field cfg-toggle">
      <Checkbox checked={checked} label={label} onChange={onChange} />
      {info ? <InfoTip text={info} /> : null}
    </div>
  );
}

/**
 * A whole-number setting where blank means "Claude Code's default". Hands the
 * caller a positive integer, or "" to remove the key; anything else typed
 * (zero, text) also removes it rather than writing a value the CLI rejects.
 */
export function NumberField({
  label,
  ariaLabel,
  info,
  hint,
  value,
  placeholder,
  onValue,
}: {
  label: string;
  ariaLabel: string;
  info?: string;
  hint?: string;
  value: number;
  placeholder: string;
  onValue: (value: number | "") => void;
}) {
  return (
    <Field label={label} info={info} hint={hint}>
      <TextField
        ariaLabel={ariaLabel}
        value={value > 0 ? String(value) : ""}
        placeholder={placeholder}
        onInput={(raw) => {
          const text = raw.trim();
          const n = text === "" ? 0 : Number.parseInt(text, 10);
          onValue(Number.isFinite(n) && n > 0 ? n : "");
        }}
      />
    </Field>
  );
}

/** The three states `attribution.commit` / `attribution.pr` can hold. */
export type AttributionMode = "default" | "none" | "custom";

const ATTRIBUTION_MODES: DropdownOption[] = [
  { value: "default", label: "Claude Code default" },
  { value: "none", label: "Add nothing" },
  { value: "custom", label: "Custom text" },
];

export function attributionMode(isSet: boolean, value: string): AttributionMode {
  if (!isSet) return "default";
  return value === "" ? "none" : "custom";
}

/**
 * An attribution key as a mode picker plus a text box.
 *
 * A bare text field cannot express this setting. Claude Code reads an
 * absent key as "add my default trailer" and a present-but-empty key as
 * "add nothing": opposite instructions that both render as an empty box.
 * Worse, clearing the box removed the key, so a user who had deliberately
 * set "" lost that the moment they typed in the field and changed their mind.
 */
export function AttributionField({
  label,
  what,
  info,
  isSet,
  value,
  onMode,
  onText,
}: {
  label: string;
  /** What Claude Code writes, as the placeholder names it: "commit trailer". */
  what: string;
  info: string;
  isSet: boolean;
  value: string;
  onMode: (mode: AttributionMode) => void;
  onText: (text: string) => void;
}) {
  const mode = attributionMode(isSet, value);
  return (
    <Field label={label} info={info}>
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
    </Field>
  );
}
