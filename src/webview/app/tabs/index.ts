/**
 * Barrel for the tab system: the tab strip, the lazy per-feature panel, and
 * the static tab registry.
 */

export { type Feature, TABS } from "../../shared/model";
export { resolveVisibleTabs, visibleTabs } from "./lib";
export { TabBar } from "./TabBar";
export { TabPanel, type TabPanelProps } from "./TabPanel";
