/**
 * Reactive wrapper around `resolveVisibleTabs`: the tab list the strip and
 * the command palette actually render, kept live against the host's
 * `claudeManager.hiddenTabs` / `claudeManager.tabOrder` settings.
 *
 * A computed rather than each consumer re-deriving it, so TabBar's render
 * and the palette's "Go to" source can never disagree about which tabs are
 * currently visible or in what order.
 */
import { computed } from "@preact/signals";
import { hiddenTabsPref, tabOrderPref } from "../../../shared/model";
import { TABS } from "../tabRegistry";
import { resolveVisibleTabs } from "./resolveTabs";

export const visibleTabs = computed(() =>
  resolveVisibleTabs(TABS, hiddenTabsPref.value, tabOrderPref.value),
);
