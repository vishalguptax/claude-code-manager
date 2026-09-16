/**
 * Top tab strip. Reads/writes the `activeTab` global signal.
 *
 * Keyboard: a WAI-ARIA `tablist`. Only the active tab is in the tab order
 * (roving tabindex); Arrow Left/Up and Right/Down move between tabs (wrapping),
 * Home/End jump to the ends. Without an arrow handler the roving tabindex would
 * be a focus trap — Tab would skip past the strip and the inactive tabs would
 * be unreachable by keyboard. Matches the shared <Segmented> radio-group
 * pattern so every tab/segment control in the webview behaves identically.
 */

import { useEffect, useRef } from "preact/hooks";
import { useEdgeAutoScroll } from "../../../shared/hooks";
import { cx } from "../../../shared/lib";
import { activeTab } from "../../../shared/model";
import { Icon } from "../../../shared/ui";
import { visibleTabs } from "../lib";
import { ReloadButton } from "./ReloadButton";

export function TabBar() {
  const current = activeTab.value;
  // Reading `.value` here is what makes this component re-render — and the
  // correction effect below re-run — whenever claudeManager.hiddenTabs or
  // claudeManager.tabOrder changes.
  const tabs = visibleTabs.value;
  const ref = useRef<HTMLDivElement>(null);

  // The strip hides its scrollbar, so when the tabs overflow there is nothing
  // on screen saying more are out there. Resting the pointer at either end
  // pulls them into view.
  useEdgeAutoScroll(ref);

  // Activate (and focus) the tab `delta` steps from the current one, wrapping
  // around the ends. Focus follows selection — the WAI-ARIA "automatic
  // activation" tab pattern, which matches how the rest of the webview's
  // segmented controls behave.
  const move = (delta: number): void => {
    const i = tabs.findIndex((t) => t.id === current);
    if (i === -1) return;
    const next = (i + delta + tabs.length) % tabs.length;
    activeTab.value = tabs[next].id;
    focusTab(tabs[next].id);
  };

  const focusTab = (id: string): void => {
    // Defer to the next frame: the roving tabindex updates on the activeTab
    // signal change, so the target button is only tabbable after the re-render.
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus();
    });
  };

  // Only the active tab spells its label (see the icon-rail block in
  // tabs.css), so the strip fits every tab at the default sidebar width. It
  // can still overflow on a hand-narrowed panel, and the active tab is
  // restored from persisted state on mount — which may be the last tab, off
  // the right edge. Pull it into view whenever it changes.
  //
  // `scrollIntoView` is not implemented in every test DOM, so the call is
  // guarded rather than assumed.
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${current}"]`);
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);

  // A tab the user is sitting on can stop existing out from under them —
  // claudeManager.hiddenTabs applies live, no reload required. Land on the
  // new first tab rather than a blank pane with no active cell in the strip.
  // `resolveVisibleTabs` guarantees `tabs` is never empty, so `tabs[0]` is
  // always safe.
  useEffect(() => {
    if (tabs.some((t) => t.id === current)) return;
    activeTab.value = tabs[0].id;
  }, [tabs, current]);

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        activeTab.value = tabs[0].id;
        focusTab(tabs[0].id);
        break;
      case "End": {
        e.preventDefault();
        const last = tabs[tabs.length - 1];
        activeTab.value = last.id;
        focusTab(last.id);
        break;
      }
    }
  };

  // The reload button is global chrome, not a tab, so it sits OUTSIDE the
  // `role="tablist"` (an undocumented child of a tablist breaks the ARIA
  // pattern). `.tab-bar` is the flex wrapper; the tablist scrolls under the
  // pinned reload affordance on the right.
  return (
    <div class="tab-bar">
      <div class="tab-list" role="tablist" ref={ref} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const isActive = tab.id === current;
          return (
            <button
              key={tab.id}
              class={cx("tab-btn", isActive && "active")}
              role="tab"
              aria-selected={isActive ? "true" : "false"}
              aria-label={tab.label}
              title={tab.label}
              tabIndex={isActive ? 0 : -1}
              data-tab={tab.id}
              onClick={() => {
                activeTab.value = tab.id;
              }}
            >
              <span class="tab-icon">
                <Icon name={tab.icon} size={16} />
              </span>
              <span class="tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <ReloadButton />
    </div>
  );
}
