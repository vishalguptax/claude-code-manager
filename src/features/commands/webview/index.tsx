/**
 * Commands feature entry. Mounts the list or detail view based on the
 * `selected` signal, requests the command catalog from the host on mount, and
 * routes inbound `commands` / `error` / `settings` messages into feature
 * signals via the shared message bus.
 */
import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { Loading } from "../../../webview/shared/ui";
import type { Command } from "../types";
import { getCommandsMsg, type Post } from "./api";
import { claudeCodeInstalled, commands, errorMessage, loading, selected } from "./model";
import { CommandDetailView, CommandsListView } from "./ui";

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
