/**
 * Settings history section — every settings.json mutation snapshots the
 * prior state host-side; this view lists those snapshots with per-entry
 * Restore (host-confirmed) and Delete (loses only the rollback option, so
 * unconfirmed) actions. Newest first; capped per scope by the host.
 *
 * Shared components: the scope chip is a <Badge>, and the restore/delete
 * actions are <Button>s (delete uses the destructive `danger` variant).
 * Timestamp/size formatting comes from the slice's JSX-free lib segment.
 */
import { Badge, Button, Icon } from "../../../../../webview/shared/ui";
import type { SettingsSnapshotInfo } from "../../../types";
import type { ConfigApi } from "../../api";
import { formatKb, formatTime } from "../../lib";

export interface SnapshotsViewProps {
  snapshots: SettingsSnapshotInfo[];
  api: ConfigApi;
}

export function SnapshotsView({ snapshots, api }: SnapshotsViewProps) {
  if (snapshots.length === 0) {
    return (
      <section class="acct-section">
        <header class="acct-section-header">
          <h2 class="acct-section-title">
            <Icon name="history" size={14} /> Settings history
          </h2>
        </header>
        <div class="acct-section-body">
          <div class="acct-field-hint">
            No snapshots yet. The next time you change a setting or permission, Claude Code Manager will
            save the previous state here so you can roll back.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section class="acct-section">
      <header class="acct-section-header">
        <h2 class="acct-section-title">
          <Icon name="history" size={14} /> Settings history
        </h2>
      </header>
      <div class="acct-section-body">
        <div class="acct-field-hint">
          Snapshots are taken before each settings.json mutation. The 20 most recent per scope are
          kept.
        </div>
        <div class="cfg-snap-list">
          {snapshots.map((s) => {
            const keysLabel =
              s.changedKeys.length === 0
                ? "no key diff"
                : `${s.changedKeys.length} key${s.changedKeys.length === 1 ? "" : "s"}: ${s.changedKeys
                    .slice(0, 3)
                    .join(", ")}${s.changedKeys.length > 3 ? "…" : ""}`;
            return (
              <div class="cfg-snap-row" key={s.id}>
                <div class="cfg-snap-meta">
                  <div class="cfg-snap-when">{formatTime(s.takenAtMs)}</div>
                  <div class="cfg-snap-detail">
                    <Badge text={s.scope} variant="scope" />
                    <span class="cfg-snap-diff">{keysLabel}</span>
                    {s.sizeBytes > 0 ? <span class="cfg-snap-size">{formatKb(s.sizeBytes)}</span> : null}
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
            );
          })}
        </div>
      </div>
    </section>
  );
}
