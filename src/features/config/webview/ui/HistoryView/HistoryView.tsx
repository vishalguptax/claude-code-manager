/**
 * History & recovery: every settings.json mutation snapshots the prior state
 * host-side, and this lists those snapshots with per-entry Restore
 * (host-confirmed) and Delete (loses only the rollback option, so
 * unconfirmed). Newest first; capped per scope by the host.
 *
 * Reset lives here too, below the list. It is the last-resort recovery (the
 * global settings.json is renamed to a timestamped .bak and Claude Code
 * regenerates a fresh one), so it belongs with the other ways back rather
 * than in a row of everyday shortcuts, where a red button sat beside "Open
 * settings.json".
 */
import { Badge, Button, Section } from "../../../../../webview/shared/ui";
import type { SettingsSnapshotInfo } from "../../../types";
import type { ConfigApi } from "../../api";
import { formatKb, formatTime } from "../../lib";
import { isSectionCollapsed, toggleSection } from "../../model";

export interface HistoryViewProps {
  snapshots: SettingsSnapshotInfo[];
  api: ConfigApi;
}

/** "3 keys: model, effortLevel, verbose…" for a snapshot's diff. */
function keysLabel(changedKeys: string[]): string {
  if (changedKeys.length === 0) return "no key diff";
  const shown = changedKeys.slice(0, 3).join(", ");
  const more = changedKeys.length > 3 ? "…" : "";
  return `${changedKeys.length} key${changedKeys.length === 1 ? "" : "s"}: ${shown}${more}`;
}

export function HistoryView({ snapshots, api }: HistoryViewProps) {
  return (
    <Section
      id="history"
      title="History & recovery"
      collapsed={isSectionCollapsed("history")}
      onToggle={toggleSection}
    >
      {snapshots.length === 0 ? (
        <div class="field-hint">
          The previous settings are saved here each time you change one, so you can roll back.
        </div>
      ) : (
        <>
          <div class="field-hint">Saved before every change. The 20 most recent per scope.</div>
          <div class="cfg-snap-list">
            {snapshots.map((s) => (
              <div class="cfg-snap-row" key={s.id}>
                <div class="cfg-snap-meta">
                  <div class="cfg-snap-when">{formatTime(s.takenAtMs)}</div>
                  <div class="cfg-snap-detail">
                    <Badge text={s.scope} variant="scope" />
                    {/* `settingsSnapshots` crosses the host boundary as
                        `unknown` and is cast, so an older or partial payload
                        can omit this array; reading `.length` off undefined
                        would blank the whole Config panel. */}
                    <span class="cfg-snap-diff">{keysLabel(s.changedKeys ?? [])}</span>
                    {s.sizeBytes > 0 ? (
                      <span class="cfg-snap-size">{formatKb(s.sizeBytes)}</span>
                    ) : null}
                  </div>
                </div>
                <div class="cfg-snap-actions">
                  <Button
                    iconName="history"
                    class="cfg-snap-restore"
                    title="Replace live settings.json with this snapshot"
                    onClick={() => api.restoreSnapshot(s.scope, s.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="danger"
                    iconName="trash-2"
                    class="cfg-snap-delete"
                    title="Delete this snapshot"
                    ariaLabel="Delete snapshot"
                    onClick={() => api.deleteSnapshot(s.scope, s.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div class="actions-row">
        <Button
          variant="danger"
          iconName="refresh-cw"
          title="Rename the global settings.json to a timestamped .bak and let Claude Code create a fresh one"
          onClick={() => api.resetSettings("global")}
        >
          Reset settings.json
        </Button>
      </div>
    </Section>
  );
}
