/**
 * Commands feature entry. Mounts the list or detail view based on the
 * `selected` signal, requests the command catalog from the host on mount, and
 * routes inbound `commands` / `error` / `settings` messages into feature
 * signals via the shared message bus.
 */
import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { Loading } from "../../../webview/components/Loading";
import { useApi } from "../../../webview/hooks/useApi";
import { registerFeatureHandler } from "../../../webview/signals/messageBus";
import type { Command } from "../types";
import { getCommandsMsg, type Post } from "./api";
import { claudeCodeInstalled, commands, errorMessage, loading, selected } from "./signals";
import { CommandDetailView } from "./views/CommandDetailView";
import { CommandsListView } from "./views/CommandsListView";

/** Apply an inbound, already-validated host message to feature signals. */
export function handleCommandsMessage(msg: Message): void {
  if (msg.type === "commands") {
    commands.value = (msg.data as Command[] | undefined) ?? [];
    loading.value = false;
    errorMessage.value = null;
  } else if (msg.type === "error") {
    loading.value = false;
    errorMessage.value = msg.message;
  } else if (msg.type === "settings") {
    claudeCodeInstalled.value = Boolean(msg.claudeCodeExtensionInstalled);
  }
}

export default function CommandsTab() {
  const { post } = useApi();

  useEffect(() => {
    const unsubscribers = [
      registerFeatureHandler("commands", handleCommandsMessage),
      registerFeatureHandler("error", handleCommandsMessage),
      registerFeatureHandler("settings", handleCommandsMessage),
    ];
    loading.value = true;
    (post as Post)(getCommandsMsg());
    return () => {
      for (const off of unsubscribers) off();
    };
  }, [post]);

  if (loading.value && commands.value.length === 0) {
    return <Loading />;
  }
  if (errorMessage.value) {
    return <div class="empty">Error: {errorMessage.value}</div>;
  }

  const current = selected.value;
  return current ? <CommandDetailView command={current} /> : <CommandsListView />;
}
