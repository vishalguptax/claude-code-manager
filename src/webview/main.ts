/**
 * Webview entry point — initialization, message listener, and mounting.
 *
 * This file is the single entry point bundled by esbuild. It acquires the
 * VS Code API once, initializes the api module, sends the "ready" signal,
 * and dispatches all incoming messages to the appropriate state updates
 * and view re-renders.
 */

import { initApi, sendReady } from "./api";
import {
  setWorkspacePath,
  setSessions,
  setStats,
  setPinnedIds,
  setDeletedIds,
  setLoading,
  setDetail,
  getView,
  getDetail,
  isShellMounted,
} from "./state";
import { mountShell, updateList, updateFilter, showList } from "./views/listView";
import { showDetail } from "./views/detailView";
import type { VSCodeAPI, Session, SessionDetail, Stats } from "./types";

// ── Bootstrap ──

declare function acquireVsCodeApi(): VSCodeAPI;
const vscode = acquireVsCodeApi();
initApi(vscode);
sendReady();

// ── Message handler ──

interface SessionGroup {
  sessions: Session[];
}

window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as Record<string, unknown>;

  if (msg.type === "workspacePath") {
    setWorkspacePath(msg.data as string);
  } else if (msg.type === "sessions") {
    const groups = msg.data as SessionGroup[];
    const flat: Session[] = [];
    for (const g of groups) flat.push(...g.sessions);
    flat.sort((a, b) => b.endTime - a.endTime);
    setSessions(flat);
    setStats(msg.stats as Stats);

    if (getView() === "list") {
      if (!isShellMounted()) mountShell();
      updateList();
      updateFilter();
    }
  } else if (msg.type === "userState") {
    setPinnedIds((msg.pinned as string[] | undefined) || []);
    setDeletedIds((msg.deleted as string[] | undefined) || []);

    if (getView() === "list") updateList();
    if (getView() === "detail" && getDetail()) showDetail();
  } else if (msg.type === "navigateList") {
    showList();
  } else if (msg.type === "sessionDetail") {
    setDetail(msg.data as SessionDetail);
    setLoading(false);
    showDetail();
  }
});
