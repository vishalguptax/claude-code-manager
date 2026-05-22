/**
 * Config feature tab — Preact entry point. Owns the Settings + Permissions
 * + Settings-history + Brain-backup surfaces (the Account tab is
 * identity / quota / usage only). Mounted lazily by the F1 TabPanel the
 * first time the Config tab is activated.
 *
 * The tab consumes the same `accountData` payload the host already produces
 * for Account — it requests it on mount and re-renders whenever the host
 * pushes a fresh one (which happens after every settings/permission
 * mutation). All host actions go through the validated `createConfigApi`
 * wrapper built on the shared `useApi()` bridge.
 */
import { useEffect, useMemo } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState, Loading } from "../../../webview/shared/ui";
import type { AccountData, PermissionScope } from "../types";
import { createConfigApi } from "./api";
import { configData, configError, loading, permissionScope, permissionSearch } from "./signals";
import { BrainView } from "./views/BrainView";
import { PermissionsView } from "./views/PermissionsView";
import { SettingsView } from "./views/SettingsView";
import { SnapshotsView } from "./views/SnapshotsView";

/**
 * Apply an inbound host message to the config signals. Exported for unit
 * testing without standing up the message bus.
 */
export function handleConfigMessage(msg: Message): void {
  if (msg.type === "accountData") {
    configData.value = msg.data as AccountData;
    configError.value = "";
    loading.value = false;
  } else if (msg.type === "error") {
    loading.value = false;
    configError.value = msg.message;
  }
}

export default function ConfigTab() {
  const { post } = useApi();
  const api = useMemo(() => createConfigApi(post), [post]);

  useEffect(() => {
    // accountData is the payload; error is shared. Register both prefixes.
    const unsubData = registerFeatureHandler("accountData", handleConfigMessage);
    const unsubErr = registerFeatureHandler("error", handleConfigMessage);
    loading.value = true;
    api.getData();
    return () => {
      unsubData();
      unsubErr();
    };
    // Mount-once: the api bridge is module-stable.
  }, [api]);

  const data = configData.value;

  if (configError.value && !data) {
    return <EmptyState title="Couldn't load config" description={configError.value} />;
  }
  if (loading.value && !data) {
    return <Loading />;
  }
  if (!data) {
    return (
      <EmptyState
        title="No config available"
        description="Make sure Claude Code is installed and you're signed in."
      />
    );
  }

  return (
    <div class="panel">
      <SettingsView data={data} api={api} />
      <PermissionsView
        data={data}
        api={api}
        scope={permissionScope.value}
        search={permissionSearch.value}
        onScopeChange={(s: PermissionScope) => {
          permissionScope.value = s;
        }}
        onSearchChange={(q: string) => {
          permissionSearch.value = q;
        }}
      />
      <SnapshotsView snapshots={data.settingsSnapshots ?? []} api={api} />
      <BrainView api={api} />
    </div>
  );
}

export { ConfigTab };
