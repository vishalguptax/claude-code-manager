/**
 * Prompt History tab entry. Requests the history once on mount, feeds host
 * replies into the feature signals, publishes the recent prompts to the
 * command palette, and renders the list.
 *
 * Copy and open-session are fire-and-forget: the host owns the clipboard and
 * the resume path, and confirms both with its own notification.
 */
import { useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import {
  activeTab,
  registerFeatureHandler,
  registerPaletteSource,
} from "../../../webview/shared/model";
import { EmptyState, ListSkeleton } from "../../../webview/shared/ui";
import type { PromptEntry } from "../types";
import { createPromptsApi } from "./api";
import { ALL_PROJECTS, promptSearchKey, promptSummary } from "./lib";
import {
  applyError,
  applyPrompts,
  errorMessage,
  loading,
  projectFilter,
  prompts,
  searchQuery,
} from "./model";
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
 * How many prompts the command palette gets, newest first.
 *
 * The palette calls every source on every keystroke and scores each item, and
 * a real history is four thousand rows — publishing all of them would put the
 * whole file through the scorer per character typed, and would bury every
 * other feature's results under a wall of near-identical prompt lines. Fifty
 * covers "what was I just asking about"; anything older is a job for the tab's
 * own search, which the palette's Prompts entry takes you to.
 */
const PALETTE_ITEM_CAP = 50;

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

/**
 * Publish the most recent prompts to the command palette. The source is
 * called per query, so it always reads the live signal without this module
 * subscribing to it.
 *
 * Choosing a result opens the tab filtered to that prompt: the list has no
 * per-row selection to restore, so the search query is the honest way to put
 * one row in front of the user.
 */
function registerPalette(): () => void {
  return registerPaletteSource("promptHistory", () =>
    prompts.value.slice(0, PALETTE_ITEM_CAP).map((entry) => ({
      id: `prompts:${entry.id}`,
      title: promptSummary(entry.text),
      subtitle: entry.projectName,
      group: "Prompts",
      icon: "pencil",
      hint: entry.repeatCount > 1 ? `×${entry.repeatCount}` : undefined,
      run: () => {
        activeTab.value = "prompts";
        projectFilter.value = ALL_PROJECTS;
        searchQuery.value = promptSearchKey(entry.text);
      },
    })),
  );
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
    const unsubscribePalette = registerPalette();
    api.getHistory();
    return () => {
      unsubscribe();
      unsubscribeError();
      unsubscribePalette();
    };
  }, [api]);

  // Before the host's first reply, show the content-shaped <ListSkeleton />
  // rather than the list's "No prompt history yet" empty state — the user is
  // waiting, not done.
  if (loading.value) return <ListSkeleton />;
  // A read failure is not an empty history, and must not read as one.
  if (errorMessage.value)
    return (
      <EmptyState
        icon="circle-alert"
        title="Couldn't load prompt history"
        description={errorMessage.value}
      />
    );

  return (
    <PromptList
      onCopy={(text) => api.copy(text)}
      onOpenSession={(sessionId) => api.openSession(sessionId)}
      onRefresh={() => api.getHistory()}
    />
  );
}

export { PromptsTab };
