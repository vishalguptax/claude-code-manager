/**
 * Barrel for the config slice's lib segment — pure helpers only (no JSX,
 * no state): snapshot formatters and the Behavior-settings option builders.
 */
export { formatKb, formatTime } from "./format";
export {
  buildEffortOptions,
  buildModelOptions,
  DEFAULT_MODE_OPTIONS,
  EFFORT_OPTIONS,
  MODEL_DESCRIPTIONS,
  prettyModelLabel,
  type SettingOption,
} from "./settingsOptions";
