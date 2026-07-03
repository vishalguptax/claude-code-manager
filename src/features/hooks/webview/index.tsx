/**
 * Hooks feature entry. Mounts the list or detail view based on the
 * `selectedHook` signal, registers a host→webview handler for the `hooks`
 * message, and requests the initial list on mount. The shell lazy-imports
 * this module's default export when the Hooks tab first activates.
 */
import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { EmptyState, ListSkeleton } from "../../../webview/shared/ui";
import type { Hook } from "../types";
import type { Post } from "./api";
import * as api from "./api";
import { errorMessage, loading, selectedHook, setError, setHooks } from "./model";
import { DetailView, ListView } from "./ui";

export default function HooksTab() {
  const { post } = useApi();

  useEffect(() => {
    // Route the host's `hooks` data message into the feature signal. The
    // shared bus has already validated the envelope with valibot, so we
    // only narrow the carried `data` to Hook[] here.
    const unsubscribe = registerFeatureHandler("hooks", (msg: Message) => {
      if (msg.type === "hooks") {
        setHooks((msg.data as Hook[]) ?? [], msg.errors ?? []);
      }
    });
    // A host parse failure surfaces as a generic `error` message; without this
    // the loading shell would spin forever (setError is what clears it).
    const unsubscribeError = registerFeatureHandler("error", (msg: Message) => {
      if (msg.type === "error") setError(msg.message);
    });
    // Request the initial list once mounted.
    api.getHooks(post as Post);
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [post]);

  if (loading.value) return <ListSkeleton />;
  if (errorMessage.value) {
    return <EmptyState title="Couldn't load hooks" description={errorMessage.value} />;
  }

  const selected = selectedHook.value;
  return selected ? <DetailView hook={selected} /> : <ListView />;
}
