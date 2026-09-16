/**
 * Memory tab entry. Wires the message bus to the feature signals, asks the
 * host for the store on mount, and renders either the list or one memory's
 * detail view.
 *
 * Delete is fire-and-forget from here on purpose: the host owns the modal
 * confirmation and the unlink, and re-pushes the store afterwards. This
 * component never learns whether the user confirmed, so it cannot route
 * around the confirmation.
 */
import { useEffect, useMemo } from "preact/hooks";
import { useApi } from "../../../webview/shared/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { ErrorBanner, ListSkeleton } from "../../../webview/shared/ui";
import type { MemoryRequest, MemoryStore } from "../types";
import { createMemoryApi } from "./api";
import {
  applyError,
  applyStore,
  errorMessage,
  loading,
  searchQuery,
  selectedId,
  selectMemory,
} from "./model";
import { MemoryDetail, MemoryList } from "./ui";

/**
 * Apply one inbound host message. Exported so the narrowing is unit-testable
 * without mounting the tab.
 *
 * The cast is the seam left by memory's message types not being variants of
 * the shared protocol union yet: the bus hands every handler a `Message`, and
 * `memoryStore` is not one of them. Narrowing on the literal first means only
 * a message that really is ours is ever read as ours. Once the shared union
 * carries the variant, the cast goes away and nothing else here changes.
 */
export function applyMemoryMessage(msg: { type: string }): void {
  if (msg.type !== "memoryStore") return;
  const data = (msg as { data?: MemoryStore }).data;
  if (data === undefined) return;
  applyStore(data);
}

export default function MemoryTab() {
  const { post } = useApi();
  const api = useMemo(() => createMemoryApi(post as (m: MemoryRequest) => void), [post]);

  useEffect(() => {
    const unsubscribe = registerFeatureHandler("memory", applyMemoryMessage);
    const unsubscribeError = registerFeatureHandler("error", (msg) => {
      if (msg.type === "error") applyError(msg.message);
    });
    api.getMemories();
    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [api]);

  if (loading.value) return <ListSkeleton />;

  return (
    <>
      {errorMessage.value !== null && <ErrorBanner errors={[errorMessage.value]} />}
      {selectedId.value === null ? (
        <MemoryList onSelect={(id) => selectMemory(id)} onRefresh={() => api.getMemories()} />
      ) : (
        <MemoryDetail
          onBack={() => {
            selectMemory(null);
            // Returning to the list keeps the project scope and lens — the
            // user chose those — but clears the search, which was a way to
            // reach this one memory, not a standing preference.
            searchQuery.value = "";
          }}
          onSelect={(id) => selectMemory(id)}
          onOpen={(m) => api.open(m.project, m.fileName)}
          onReveal={(m) => api.reveal(m.project, m.fileName)}
          onDelete={(m) => api.remove(m.project, m.fileName)}
        />
      )}
    </>
  );
}

export { MemoryTab };
