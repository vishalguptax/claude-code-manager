/**
 * Inbound host → webview message handling for the sessions feature. Fans each
 * validated `Message` into the feature signals. Kept in the model segment (not
 * the slice entry) so the message-handling contract is unit-testable without a
 * DOM and the entry component stays a thin mount shell.
 *
 * The bus parses each event with the shared valibot schema before we ever see
 * it, so payloads are already validated here.
 */
import type { Message } from "../../../../shared/protocol/messages";
import { maybeShowIntro } from "../../../../webview/shared/model";
import type { Session, SessionDetail, SessionGroup, Stats, WorktreeRef } from "../../types";
import { sendSearchFullText } from "../api";
import { flattenGroups } from "../lib";
import {
  type SessionsDelta,
  applyDefaultFilters,
  applyDelta,
  currentBranchSignal,
  detailLoadingSignal,
  detailSignal,
  loadedSignal,
  restoreCountSignal,
  selectedIdSignal,
  sessionsSignal,
  setArchived,
  setDeleted,
  setFullTextHits,
  setOpenTerminals,
  setTempSessions,
  setPinned,
  setWorkspacePath,
  setWorktrees,
  pruneUnmatchedFilters,
  statsSignal,
  viewSignal,
} from "./signals";

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
      // First list (even an empty one) ends the cold-start loading gate so the
      // list/empty-state can render. Subsequent pushes keep it loaded.
      loadedSignal.value = true;
      // A persisted project/branch choice can name something this data set has
      // nothing under; drop it rather than render an unexplained empty list
      // the user cannot escape by reopening.
      pruneUnmatchedFilters();
      break;
    }
    case "error": {
      // A host parse/read failure also ends loading — otherwise the panel would
      // sit on the <Loading /> placeholder forever. The list's own empty-state
      // covers the "loaded but zero sessions" case.
      loadedSignal.value = true;
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
      if (msg.archived) setArchived(msg.archived);
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
    case "tempSessions":
      setTempSessions(msg.ids);
      break;
    case "worktrees":
      // Values pass through the shared protocol as `unknown`; the feature owns
      // the WorktreeRef shape and narrows here.
      setWorktrees(msg.map as Record<string, WorktreeRef>);
      // Worktree refs re-key the project dropdown (project name -> repoRoot),
      // so re-check the selection now that the mapping is final.
      pruneUnmatchedFilters();
      break;
    case "terminalSessions":
      setOpenTerminals(msg.ids);
      break;
    case "settings": {
      // Host-pushed sessions config: apply the configured restore count, and
      // seed the initial date/project filters from the user's defaults
      // (persisted selections still win — see applyDefaultFilters).
      // v1 handled this in main.ts; the v2 sessions handler had dropped it, so
      // restoreCount/defaultFilter/defaultProject settings did nothing.
      const m = msg as {
        restoreCount?: number;
        defaultFilter?: string;
        defaultProject?: string;
        demoSeen?: boolean;
      };
      if (typeof m.restoreCount === "number") {
        restoreCountSignal.value = m.restoreCount;
      }
      applyDefaultFilters(m.defaultFilter, m.defaultProject);
      // First-run intro plays once per install; the host gates it via the
      // persisted demoSeen flag carried on this settings push.
      if (typeof m.demoSeen === "boolean") maybeShowIntro(m.demoSeen);
      break;
    }
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
