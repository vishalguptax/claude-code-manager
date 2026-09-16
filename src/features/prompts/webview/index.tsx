/**
 * Prompt History tab entry. Requests the history once on mount, feeds host
 * replies into the feature signals, and renders the list.
 *
 * Copy and open-session are fire-and-forget: the host owns the clipboard and
 * the resume path, and confirms both with its own notification.
 */
import { useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { ListSkeleton } from "../../../webview/shared/ui";
import type { PromptEntry } from "../types";
import { createPromptsApi } from "./api";
import { applyError, applyPrompts, loading } from "./model";
import { PromptList } from "./ui";

/**
 * Message-bus prefix this tab listens on.
 *
 * NOT `"prompt"`: the bus fans out by prefix, and the config feature already
 * owns `promptAddHook`, `promptCustomModel`, `promptSaveProfile` and friends.
 * Registering `"prompt"` here would hand this tab every one of those dialogs.
 */
const BUS_PREFIX = "promptHistory";

/**
 * Narrow a bus message to this feature's inbound payload.
 *
 * Hand-written rather than a type narrow on the shared `Message` union: the
 * `promptHistory` variant is not in `src/shared/protocol/messages.ts` yet, so
 * there is nothing to narrow against. The guard stays correct — and this call
 * site unchanged — once it is.
 */
function asPromptHistory(raw: unknown): PromptEntry[] | null {
  const msg = raw as { type?: unknown; data?: unknown } | null;
  if (!msg || msg.type !== "promptHistory") return null;
  return Array.isArray(msg.data) ? (msg.data as PromptEntry[]) : [];
}

export default function PromptsTab() {
  const { post } = useApi();
  const api = useMemo(() => createPromptsApi(post), [post]);

  useEffect(() => {
    const unsubscribe = registerFeatureHandler(BUS_PREFIX, (msg) => {
      const data = asPromptHistory(msg);
      if (data) applyPrompts(data);
    });
    const unsubscribeError = registerFeatureHandler("error", (msg) => {
      if (msg.type === "error") applyError(msg.message);
    });
    api.getHistory();
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [api]);

  if (loading.value) return <ListSkeleton />;

  return (
    <PromptList
      onCopy={(text) => api.copy(text)}
      onOpenSession={(sessionId) => api.openSession(sessionId)}
    />
  );
}

export { PromptsTab };
