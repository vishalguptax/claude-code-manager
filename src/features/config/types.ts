/**
 * Config feature types. The Config tab edits the same `AccountData`
 * payload the host already produces for the Account tab — Settings,
 * Permissions, Snapshots, and Brain backup live here while Account owns
 * identity / quota / usage. Re-exporting the account shapes (rather than
 * redeclaring them) keeps a single source of truth for the payload.
 *
 * Cross-feature *type* imports are allowed by the v2 boundary rules
 * (§1.3) — only runtime cross-feature imports are forbidden. Config
 * pulls no account runtime code; every host action it triggers is a
 * shared-protocol message handled host-side.
 */
export type {
  AccountData,
  AccountSettings,
  PermissionScope,
  PermissionSet,
  PermissionDefaultMode,
  SettingsSnapshotInfo,
} from "../account/types";

/** Which permission list a tool entry belongs to. */
export type PermissionList = "allow" | "deny";
