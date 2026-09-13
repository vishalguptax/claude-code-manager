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
import { Badge, Button, SectionHeader } from "../../../../../webview/shared/ui";
import { isSectionCollapsed, toggleSection } from "../../model";
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
      <section class="section">
        <SectionHeader
          id="snapshots"
          title="Settings history"
          icon="history"
          collapsed={isSectionCollapsed("snapshots")}
          onToggle={toggleSection}
        />
        {isSectionCollapsed("snapshots") ? null : (
          <div class="section-body">
            <div class="field-hint">
              No snapshots yet. The next time you change a setting or permission, Claude Code Manager will
              save the previous state here so you can roll back.
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section class="section">
      <SectionHeader
        id="snapshots"
        title="Settings history"
        icon="history"
        collapsed={isSectionCollapsed("snapshots")}
        onToggle={toggleSection}
      />
      {isSectionCollapsed("snapshots") ? null : (
        <div class="section-body">
          <div class="field-hint">
            Snapshots are taken before each settings.json mutation. The 20 most recent per scope are
            kept.
          </div>
          <div class="cfg-snap-list">
            {snapshots.map((s) => {
              // `settingsSnapshots` crosses the host boundary as `unknown` and is
          // cast, so an older or partial payload can omit this array. Reading
          // `.length` off undefined throws during render, which blanks the whole
          // Config panel over one missing field.
          const changedKeys = s.changedKeys ?? [];
          const keysLabel =
                changedKeys.length === 0
                  ? "no key diff"
                  : `${changedKeys.length} key${changedKeys.length === 1 ? "" : "s"}: ${changedKeys
                      .slice(0, 3)
                      .join(", ")}${changedKeys.length > 3 ? "…" : ""}`;
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
      )}
    </section>
  );
}
