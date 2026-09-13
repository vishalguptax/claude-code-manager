/**
 * Sessions feature slice entry. Default-exported Preact component mounted
 * lazily by the shell's TabPanel — must stay at `webview/index.tsx` so the lazy
 * import path is stable.
 *
 * On mount it registers a message-bus handler that fans inbound host messages
 * into the feature signals (see the `model` segment's message handlers), then
 * sends `ready` so the host pushes the initial data. The bus parses each event
 * with the shared valibot schema before we ever see it, so payloads are already
 * validated by the time the handlers run.
 */
import { useEffect } from "preact/hooks";
import { SessionsSkeleton } from "../../../webview/app/tabs/skeletons";
import { registerFeatureHandler, registerPaletteSource } from "../../../webview/shared/model";
import { activeTab } from "../../../webview/shared/model";
import { fmtRelativeTime } from "../../../webview/utils";
import { sendGetSessionDetail, sendReady } from "./api";
import {
  detailLoadingSignal,
  handleDelta,
  handleMessage,
  initFilterPersistence,
  loadedSignal,
  loadPersistedFilters,
  selectedIdSignal,
  sessionsSignal,
  stopFilterPersistence,
  viewSignal,
} from "./model";

/**
 * How many sessions to offer the palette. The list can hold thousands; the
 * palette shows at most 50 after ranking, so anything past a few hundred is
 * scored and discarded on every keystroke.
 */
const PALETTE_SESSIONS = 300;
import { DetailView } from "./ui/views/DetailView";
import { ListView } from "./ui/views/ListView";

// Re-export the host-message handlers from the model so existing tests that
// import them from the slice entry keep resolving.
export { handleDelta, handleMessage } from "./model";

export default function SessionsTab() {
  useEffect(() => {
    // Restore the user's last filter choices BEFORE starting the persistence
    // writer, so the writer's first run records the restored values rather than
    // overwriting them with the defaults. Order matters here.
    loadPersistedFilters();
    initFilterPersistence();

    // The bus matches by type prefix; an empty prefix sees every message and
    // we narrow to the ones the sessions feature owns. The bus has already
    // validated each message against the shared valibot schema.
    const unsub = registerFeatureHandler("", (msg) => {
      if (msg.type === "sessions.delta") {
        handleDelta(msg.payload);
        return;
      }
      handleMessage(msg);
    });
    sendReady();

    // Sessions in the command palette. The source reads the signal when the
    // palette asks, so it always reflects the current list without this module
    // subscribing to anything. Capped: the palette ranks and truncates, and
    // handing it thousands of rows per keystroke to throw most of them away is
    // work nobody sees.
    const unsubPalette = registerPaletteSource("sessions", () =>
      sessionsSignal.value.slice(0, PALETTE_SESSIONS).map((s) => ({
        id: `session:${s.id}`,
        title: s.name || s.prompts[0] || "Untitled session",
        subtitle: s.project,
        group: "Sessions",
        icon: "message-square",
        hint: fmtRelativeTime(s.endTime, Date.now()),
        run: () => {
          activeTab.value = "sessions";
          selectedIdSignal.value = s.id;
          detailLoadingSignal.value = true;
          viewSignal.value = "detail";
          sendGetSessionDetail(s.id);
        },
      })),
    );

    return () => {
      unsub();
      unsubPalette();
      stopFilterPersistence();
    };
  }, []);

  // Detail carries its own transcript loader (detailLoadingSignal), so only the
  // list path gates on the first-data signal: until the host's first `sessions`
  // message arrives, show the content-shaped <SessionsSkeleton /> (actions +
  // search + filters + session rows) rather than the empty list (which would
  // read as "No sessions yet").
  if (viewSignal.value === "detail") return <DetailView />;
  if (!loadedSignal.value) return <SessionsSkeleton />;
  return <ListView />;
}
