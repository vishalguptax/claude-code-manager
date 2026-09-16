/**
 * "Sidebar tabs" — show/hide and reorder the tab strip, from inside the
 * panel rather than by hand-editing `claudeManager.hiddenTabs` /
 * `claudeManager.tabOrder` in settings.json.
 *
 * The row list always shows EVERY tab, hidden ones included — hiding is a
 * checkbox on a row that stays in the list, not removal from it. There
 * would be no way to bring a tab back if unchecking it made the row
 * disappear along with the control that re-checks it.
 *
 * Both settings are written together, in one host round trip
 * (`api.setTabPreferences`), because VS Code fires one
 * `onDidChangeConfiguration` per `update()` call and the panel's listener
 * re-pushes the whole `settings` payload on each — two separate writes
 * would mean two redundant re-renders of every open tab for one user
 * action.
 *
 * Echo lag: the write round-trips through the host before
 * `hiddenTabsPref` / `tabOrderPref` catch up, same as every other setting
 * in this tab. `Checkbox` already smooths that itself. Drag-and-order
 * has no such built-in smoothing, so this component holds its own local
 * copy of the full order and treats the live signal as authoritative
 * only once it echoes back what was last sent — otherwise a drop would
 * visually snap back to the pre-drop order for the length of the round
 * trip and then jump again.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import {
  type Feature,
  hiddenTabsPref,
  resolveVisibleTabs,
  tabOrderPref,
  TABS,
} from "../../../../../webview/shared/model";
import { Button, Checkbox, Icon, Section } from "../../../../../webview/shared/ui";
import type { ConfigApi } from "../../api";
import { moveTab, toggleHiddenTab } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";

export interface TabsViewProps {
  api: ConfigApi;
}

/** Serialise for the cheap "does this echo match what we sent" comparison. */
function key(order: readonly string[], hidden: readonly string[]): string {
  return JSON.stringify([order, hidden]);
}

export function TabsView({ api }: TabsViewProps) {
  const liveOrder = resolveVisibleTabs(TABS, [], tabOrderPref.value).map((t) => t.id);
  const liveHidden = hiddenTabsPref.value;

  const [order, setOrder] = useState(liveOrder);
  const [hidden, setHidden] = useState(liveHidden);
  // Holds the key of the last value WE sent, until the live signals echo it
  // back — see the file header. Cleared once they match, so an external
  // change (hand-edited settings.json, the native Settings UI) is picked
  // up normally the rest of the time.
  const pending = useRef<string | null>(null);

  useEffect(() => {
    const liveKey = key(liveOrder, liveHidden);
    if (pending.current !== null) {
      if (liveKey === pending.current) pending.current = null;
      else return;
    }
    setOrder(liveOrder);
    setHidden(liveHidden);
    // Deliberately keyed on the SERIALISED value, not [liveOrder, liveHidden]:
    // both are derived fresh every render (new array identity each time), so
    // depending on the arrays themselves would run this effect on every
    // render regardless of whether anything actually changed.
  }, [key(liveOrder, liveHidden)]);

  const commit = (nextOrder: string[], nextHidden: string[]): void => {
    setOrder(nextOrder);
    setHidden(nextHidden);
    pending.current = key(nextOrder, nextHidden);
    api.setTabPreferences(nextHidden, nextOrder);
  };

  const byId = new Map<string, Feature>(TABS.map((t) => [t.id, t]));
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <Section
      id="tabs"
      title="Sidebar tabs"
      icon="sliders-horizontal"
      collapsed={isSectionCollapsed("tabs")}
      onToggle={toggleSection}
    >
      <div class="cfg-tabs-list" role="list" aria-label="Sidebar tabs">
        {order.map((id, index) => {
          const tab = byId.get(id);
          if (!tab) return null;
          const isHidden = hidden.includes(id);
          return (
            <div
              key={id}
              role="listitem"
              class="cfg-tab-row"
              draggable
              aria-grabbed={dragIndex === index}
              onDragStart={(e) => {
                setDragIndex(index);
                // Firefox requires data to be set for the drag to start at all.
                e.dataTransfer?.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                // Without preventDefault the browser refuses the row as a
                // drop target and shows the "no drop" cursor.
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex === null || dragIndex === index) return;
                commit(moveTab(order, dragIndex, index), hidden);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
            >
              <span class="cfg-tab-grip" aria-hidden="true" title="Drag to reorder">
                <span />
                <span />
                <span />
              </span>
              <Icon name={tab.icon} size={14} />
              <Checkbox
                class="cfg-tab-checkbox"
                checked={!isHidden}
                label={tab.label}
                onChange={() => commit(order, toggleHiddenTab(hidden, id))}
              />
              <span class="cfg-tab-move">
                <Button
                  variant="icon"
                  iconName="chevron-down"
                  class="cfg-tab-move-up"
                  ariaLabel={`Move ${tab.label} up`}
                  title={`Move ${tab.label} up`}
                  disabled={index === 0}
                  onClick={() => commit(moveTab(order, index, index - 1), hidden)}
                />
                <Button
                  variant="icon"
                  iconName="chevron-down"
                  ariaLabel={`Move ${tab.label} down`}
                  title={`Move ${tab.label} down`}
                  disabled={index === order.length - 1}
                  onClick={() => commit(moveTab(order, index, index + 1), hidden)}
                />
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
