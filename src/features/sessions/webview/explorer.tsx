/**
 * The sessions explorer tab — the entry the shell mounts when the host boots
 * a document for the explorer (see `sessionPanels.ts`).
 *
 * It feeds the shared sessions model the same way the sidebar tab does, with
 * one exception: `navigateList`, which the host sends every view after a
 * delete, means "leave the detail for the list" — and here the list is
 * already on screen beside the detail.
 */
import { useEffect } from "preact/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { sendReady } from "./api";
import { handleMessage, initExplorerPersistence } from "./model";
import { ExplorerView } from "./ui/views/ExplorerView";

export function SessionsExplorer() {
  useEffect(() => {
    const unsub = registerFeatureHandler("", (msg) => {
      if (msg.type === "navigateList") return;
      handleMessage(msg);
    });
    sendReady();
    const stopPersistence = initExplorerPersistence();
    return () => {
      unsub();
      stopPersistence();
    };
  }, []);

  return <ExplorerView />;
}
