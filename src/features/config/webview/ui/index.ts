/**
 * Barrel for the config slice's ui segment — the four section views that
 * make up the Config tab. Each is a CDD folder with a co-located test.
 *
 * `ConfigSkeleton` lives in the SHELL (`src/webview/app/tabs/skeletons/`) so
 * it can render before the Config feature chunk has finished downloading. The
 * feature's own loading branch re-imports it from there.
 */
export { BrainView, type BrainViewProps } from "./BrainView";
export { PermissionsView, type PermissionsViewProps } from "./PermissionsView";
export { SettingsView, type SettingsViewProps } from "./SettingsView";
export { SnapshotsView, type SnapshotsViewProps } from "./SnapshotsView";
