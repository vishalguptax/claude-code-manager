/**
 * A session's detail as a whole editor tab — the entry the shell mounts when
 * the host boots a document for one session (see `sessionPanels.ts`).
 *
 * It reuses the sidebar's model and DetailView unchanged. Only two things
 * differ: there is no list, so the tab pins the selection to its own session
 * and drops `navigateList`; and the view renders in its "tab" context,
 * without the back-to-list and open-in-editor controls.
 */
import { useEffect } from "preact/hooks";
import { registerFeatureHandler } from "../../../webview/shared/model";
import { sendGetSessionDetail, sendReady } from "./api";
import {
  detailLoadingSignal,
  handleMessage,
  selectedIdSignal,
  viewSignal,
} from "./model";
import { DetailView } from "./ui/views/DetailView";

export interface SessionPanelProps {
  sessionId: string;
}

export function SessionPanel({ sessionId }: SessionPanelProps) {
  useEffect(() => {
    selectedIdSignal.value = sessionId;
    viewSignal.value = "detail";
    detailLoadingSignal.value = true;

    const unsub = registerFeatureHandler("", (msg) => {
      // Sent to every view after a delete made from the sidebar; it means
      // "leave the detail you are on". A tab has nowhere to go, and the
      // session deleted may not even be this one.
      if (msg.type === "navigateList") return;
      handleMessage(msg);
    });
    // `ready` brings the state DetailView reads around the transcript: pins,
    // open terminals, worktrees, the workspace and the host's settings.
    sendReady();
    sendGetSessionDetail(sessionId);
    return unsub;
  }, [sessionId]);

  return <DetailView context="tab" />;
}
