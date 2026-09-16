/**
 * Barrel for the config slice's lib segment — pure helpers only (no JSX,
 * no state): snapshot formatters and the Behavior-settings option builders.
 */
export { formatKb, formatTime } from "./format";
export { moveTab, toggleHiddenTab } from "./tabPrefs";
export {
  buildEffortOptions,
  buildModelOptions,
  buildOutputStyleOptions,
  DEFAULT_MODE_OPTIONS,
  EDITOR_MODE_OPTIONS,
  OUTPUT_STYLE_OPTIONS,
  EFFORT_OPTIONS,
  MODEL_DESCRIPTIONS,
  prettyModelLabel,
  type SettingOption,
} from "./settingsOptions";
