/**
 * Settings history section — every settings.json mutation snapshots the
 * prior state host-side; this view lists those snapshots with per-entry
 * Restore (host-confirmed) and Delete (loses only the rollback option, so
 * unconfirmed) actions. Newest first; capped per scope by the host.
 */
import { Icon } from "../../../../webview/shared/ui";
import type { SettingsSnapshotInfo } from "../../types";
import type { ConfigApi } from "../api";

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

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
            No snapshots yet. The next time you change a setting or permission, Claude Manager will
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
                    <span class="cfg-snap-scope">{s.scope}</span>
                    <span class="cfg-snap-diff">{keysLabel}</span>
                    {s.sizeBytes > 0 ? <span class="cfg-snap-size">{formatKb(s.sizeBytes)}</span> : null}
                  </div>
                </div>
                <div class="cfg-snap-actions">
                  <button
                    class="btn cfg-snap-restore"
                    title="Replace live settings.json with this snapshot"
                    onClick={() => api.restoreSnapshot(s.scope, s.id)}
                  >
                    <Icon name="history" size={12} /> Restore
                  </button>
                  <button
                    class="btn del cfg-snap-delete"
                    title="Delete this snapshot"
                    onClick={() => api.deleteSnapshot(s.scope, s.id)}
                  >
                    <Icon name="trash-2" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
