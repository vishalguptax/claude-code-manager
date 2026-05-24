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

import { useRef } from "preact/hooks";
import { cx } from "../../../shared/lib";
import { activeTab } from "../../../shared/model";
import { Icon } from "../../../shared/ui";
import { TABS } from "../tabRegistry";

export function TabBar() {
  const current = activeTab.value;
  const ref = useRef<HTMLDivElement>(null);

  // Activate (and focus) the tab `delta` steps from the current one, wrapping
  // around the ends. Focus follows selection — the WAI-ARIA "automatic
  // activation" tab pattern, which matches how the rest of the webview's
  // segmented controls behave.
  const move = (delta: number): void => {
    const i = TABS.findIndex((t) => t.id === current);
    if (i === -1) return;
    const next = (i + delta + TABS.length) % TABS.length;
    activeTab.value = TABS[next].id;
    focusTab(TABS[next].id);
  };

  const focusTab = (id: string): void => {
    // Defer to the next frame: the roving tabindex updates on the activeTab
    // signal change, so the target button is only tabbable after the re-render.
    requestAnimationFrame(() => {
      ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus();
    });
  };

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
        activeTab.value = TABS[0].id;
        focusTab(TABS[0].id);
        break;
      case "End": {
        e.preventDefault();
        const last = TABS[TABS.length - 1];
        activeTab.value = last.id;
        focusTab(last.id);
        break;
      }
    }
  };

  return (
    <div class="tab-bar" role="tablist" ref={ref} onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const isActive = tab.id === current;
        return (
          <button
            key={tab.id}
            class={cx("tab-btn", isActive && "active")}
            role="tab"
            aria-selected={isActive ? "true" : "false"}
            aria-label={tab.label}
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
  );
}
