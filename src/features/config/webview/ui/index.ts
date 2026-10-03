/**
 * Barrel for the config slice's ui segment: the sections that make up the
 * Config tab, in the order the tab renders them, plus the field shapes they
 * share. Each is a CDD folder with a co-located test.
 *
 * `ConfigSkeleton` lives in the SHELL (`src/webview/app/tabs/skeletons/`) so
 * it can render before the Config feature chunk has finished downloading. The
 * feature's own loading branch re-imports it from there.
 */
export { ModelSection, type ModelSectionProps } from "./ModelSection";
export { PermissionsView, type PermissionsViewProps } from "./PermissionsView";
export { ContextSection, type ContextSectionProps } from "./ContextSection";
export { GitSection, type GitSectionProps } from "./GitSection";
export { InterfaceSection, type InterfaceSectionProps } from "./InterfaceSection";
export { TabsView, type TabsViewProps } from "./TabsView";
export { HistoryView, type HistoryViewProps } from "./HistoryView";
export { BackupView, type BackupViewProps } from "./BackupView";
