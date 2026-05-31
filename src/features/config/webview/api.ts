/**
 * Typed webview → host senders for the Config tab. Every send is narrowed
 * to a `WebviewMessage` variant from the shared protocol, so a typo or
 * shape drift fails at compile time. Built on the shared `useApi()` bridge
 * (passed in as `post`) exactly like the other migrated features — no
 * module-local VS Code handle, no legacy `send*` surface.
 */
import type { WebviewMessage, SettingsScope, PermissionList } from "../../../shared/protocol/messages";

/** The validated config action surface, built from the host `post` bridge. */
export interface ConfigApi {
  getData(): void;
  setModel(model: string): void;
  promptCustomModel(): void;
  setVoiceEnabled(value: boolean): void;
  setCommitAttribution(value: string): void;
  setPrAttribution(value: string): void;
  setSetting(key: string, value: unknown, scope?: SettingsScope): void;
  openSettingsFile(scope: SettingsScope): void;
  openExtensionSettings(): void;
  resetSettings(scope: SettingsScope): void;
  launchSlash(command: string): void;
  runCommand(command: string): void;
  promptAddPermission(scope: SettingsScope, list: PermissionList): void;
  promptRemovePermission(scope: SettingsScope, tool: string, list: PermissionList): void;
  promptAddDirectory(): void;
  restoreSnapshot(scope: SettingsScope, snapshotId: string): void;
  deleteSnapshot(scope: SettingsScope, snapshotId: string): void;
}

/** Build the config API from the shared host post bridge. */
export function createConfigApi(post: (msg: unknown) => void): ConfigApi {
  const send = (msg: WebviewMessage): void => post(msg);
  return {
    getData: () => send({ type: "getAccountData" }),
    setModel: (model) => send({ type: "setModel", model }),
    promptCustomModel: () => send({ type: "promptCustomModel" }),
    setVoiceEnabled: (value) => send({ type: "setVoiceEnabled", value }),
    setCommitAttribution: (value) => send({ type: "setCommitAttribution", value }),
    setPrAttribution: (value) => send({ type: "setPrAttribution", value }),
    setSetting: (key, value, scope = "global") => send({ type: "setSetting", key, value, scope }),
    openSettingsFile: (scope) => send({ type: "openSettingsFile", scope }),
    openExtensionSettings: () => send({ type: "openExtensionSettings" }),
    resetSettings: (scope) => send({ type: "resetSettings", scope }),
    launchSlash: (command) => send({ type: "launchSlash", command }),
    runCommand: (command) => send({ type: "runCommand", command }),
    promptAddPermission: (scope, list) => send({ type: "promptAddPermission", scope, list }),
    promptRemovePermission: (scope, tool, list) =>
      send({ type: "promptRemovePermission", scope, tool, list }),
    promptAddDirectory: () => send({ type: "promptAddDirectory" }),
    restoreSnapshot: (scope, snapshotId) =>
      send({ type: "restoreSettingsSnapshot", scope, snapshotId }),
    deleteSnapshot: (scope, snapshotId) =>
      send({ type: "deleteSettingsSnapshot", scope, snapshotId }),
  };
}
