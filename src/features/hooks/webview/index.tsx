/**
 * Hooks feature entry. Mounts the list or detail view based on the
 * `selectedHook` signal, registers a host→webview handler for the `hooks`
 * message, and requests the initial list on mount. The shell lazy-imports
 * this module's default export when the Hooks tab first activates.
 */
import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { EmptyState } from "../../../webview/components/EmptyState";
import { Loading } from "../../../webview/components/Loading";
import { useApi } from "../../../webview/hooks/useApi";
import { registerFeatureHandler } from "../../../webview/signals/messageBus";
import type { Hook } from "../types";
import type { Post } from "./api";
import * as api from "./api";
import { errorMessage, loading, selectedHook, setHooks } from "./signals";
import { DetailView } from "./views/DetailView";
import { ListView } from "./views/ListView";

export default function HooksTab() {
  const { post } = useApi();

  useEffect(() => {
    // Route the host's `hooks` data message into the feature signal. The
    // shared bus has already validated the envelope with valibot, so we
    // only narrow the carried `data` to Hook[] here.
    const unsubscribe = registerFeatureHandler("hooks", (msg: Message) => {
      if (msg.type === "hooks") {
        setHooks((msg.data as Hook[]) ?? []);
      }
    });
    // Request the initial list once mounted.
    api.getHooks(post as Post);
    return unsubscribe;
  }, [post]);

  if (loading.value) return <Loading />;
  if (errorMessage.value) {
    return <EmptyState title="Couldn't load hooks" description={errorMessage.value} />;
  }

  const selected = selectedHook.value;
  return selected ? <DetailView hook={selected} /> : <ListView />;
}
