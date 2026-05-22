/**
 * Sessions feature tab. Default-exported Preact component mounted lazily by
 * the shell's TabPanel.
 *
 * On mount it registers a message-bus handler that fans inbound host messages
 * into the feature signals, then sends `ready` so the host pushes the initial
 * data. The handler covers every host → webview message the sessions feature
 * consumes; the bus parses each event with the shared valibot schema before we
 * ever see it, so payloads are already validated here.
 */
import { useEffect } from "preact/hooks";
import type { Message } from "../../../shared/protocol/messages";
import { registerFeatureHandler } from "../../../webview/signals/messageBus";
import type { Session, SessionDetail, SessionGroup, Stats } from "../types";
import { sendReady } from "./api";
import {
  applyDelta,
  currentBranchSignal,
  detailLoadingSignal,
  detailSignal,
  type SessionsDelta,
  selectedIdSignal,
  sessionsSignal,
  setDeleted,
  setFullTextHits,
  setPinned,
  setWorkspacePath,
  statsSignal,
  viewSignal,
} from "./signals";
import { DetailView } from "./views/DetailView";
import { ListView } from "./views/ListView";

/**
 * Flatten the host's grouped session payload back into a flat array. The host
 * still groups by date for the legacy contract; the virtualized list wants a
 * single ordered array, so we concat the groups (which already arrive in
 * display order).
 */
function flattenGroups(data: SessionGroup[]): SessionGroup["sessions"] {
  const out: SessionGroup["sessions"] = [];
  for (const g of data) out.push(...g.sessions);
  return out;
}

/**
 * Apply one validated host message to the feature signals. Exported for unit
 * tests so the message-handling contract can be exercised without a DOM.
 */
export function handleMessage(msg: Message): void {
  switch (msg.type) {
    case "sessions": {
      const groups = (msg.data as SessionGroup[]) ?? [];
      sessionsSignal.value = flattenGroups(groups);
      if (msg.stats) statsSignal.value = msg.stats as Stats;
      break;
    }
    case "sessionDetail": {
      detailSignal.value = msg.data as SessionDetail;
      detailLoadingSignal.value = false;
      break;
    }
    case "userState": {
      if (msg.pinned) setPinned(msg.pinned);
      if (msg.deleted) setDeleted(msg.deleted);
      break;
    }
    case "navigateList": {
      viewSignal.value = "list";
      selectedIdSignal.value = null;
      detailSignal.value = null;
      break;
    }
    case "workspacePath":
      setWorkspacePath(msg.data);
      break;
    case "workspaceBranch":
      currentBranchSignal.value = msg.data;
      break;
    case "fullTextResults":
      setFullTextHits(msg.query, msg.ids);
      break;
    default:
      break;
  }
}

/**
 * Apply a `sessions.delta` payload by mutating the list signal in place. The
 * shared protocol types the rows as `unknown[]`; we narrow to `Session[]` here
 * since the feature owns that type. Exported for unit tests.
 */
export function handleDelta(payload: {
  added?: unknown[];
  updated?: unknown[];
  removed?: string[];
}): void {
  const delta: SessionsDelta = {
    added: payload.added as Session[] | undefined,
    updated: payload.updated as Session[] | undefined,
    removed: payload.removed,
  };
  sessionsSignal.value = applyDelta(sessionsSignal.value, delta);
}

export default function SessionsTab() {
  useEffect(() => {
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
    return unsub;
  }, []);

  return viewSignal.value === "detail" ? <DetailView /> : <ListView />;
}
