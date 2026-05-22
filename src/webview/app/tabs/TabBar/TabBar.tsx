/**
 * Top tab strip. Reads/writes the `activeTab` global signal.
 */

import { cx } from "../../../shared/lib";
import { activeTab } from "../../../shared/model";
import { Icon } from "../../../shared/ui";
import { TABS } from "../tabRegistry";

export function TabBar() {
  const current = activeTab.value;
  return (
    <div class="tab-bar" role="tablist">
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
