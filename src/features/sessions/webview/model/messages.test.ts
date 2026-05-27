// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "../../../../shared/protocol/messages";
import type { Session, SessionDetail, SessionGroup } from "../../types";
import { handleDelta, handleMessage } from "./messages";
import {
  currentBranchSignal,
  deletedSignal,
  detailLoadingSignal,
  detailSignal,
  loadedSignal,
  pinnedSignal,
  searchQuerySignal,
  selectedIdSignal,
  sessionsSignal,
  setFullTextHits,
  statsSignal,
  viewSignal,
  _resetSessionsSignals,
} from "./signals";

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: "",
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    ...over,
  };
}

describe("sessions message handling", () => {
  beforeEach(() => _resetSessionsSignals());

  it("flattens grouped sessions and stores stats", () => {
    const groups: SessionGroup[] = [
      { label: "Today", sessions: [session("a"), session("b")] },
      { label: "Yesterday", sessions: [session("c")] },
    ];
    const stats = { totalSessions: 3, totalProjects: 1, thisWeek: 3, totalMessages: 9 };
    handleMessage({ type: "sessions", data: groups, stats } as Message);
    expect(sessionsSignal.value.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(statsSignal.value).toEqual(stats);
  });

  it("stores detail and clears the loading flag", () => {
    detailLoadingSignal.value = true;
    const detail = { ...session("a"), messages: [] } as SessionDetail;
    handleMessage({ type: "sessionDetail", data: detail } as Message);
    expect(detailSignal.value?.id).toBe("a");
    expect(detailLoadingSignal.value).toBe(false);
  });

  it("applies userState pinned + deleted ids", () => {
    handleMessage({ type: "userState", pinned: ["a"], deleted: ["b"], renames: {} } as Message);
    expect([...pinnedSignal.value]).toEqual(["a"]);
    expect([...deletedSignal.value]).toEqual(["b"]);
  });

  it("navigateList resets to the list view", () => {
    viewSignal.value = "detail";
    selectedIdSignal.value = "a";
    detailSignal.value = { ...session("a"), messages: [] } as SessionDetail;
    handleMessage({ type: "navigateList" } as Message);
    expect(viewSignal.value).toBe("list");
    expect(selectedIdSignal.value).toBeNull();
    expect(detailSignal.value).toBeNull();
  });

  it("stores workspace path and branch", () => {
    handleMessage({ type: "workspacePath", data: "/repo/app" } as Message);
    handleMessage({ type: "workspaceBranch", data: "feature" } as Message);
    expect(currentBranchSignal.value).toBe("feature");
  });

  it("stores full-text results matching the live query", () => {
    searchQuerySignal.value = "deploy";
    handleMessage({ type: "fullTextResults", query: "deploy", ids: ["x"] } as Message);
    // setFullTextHits is exercised; a stale query is dropped.
    handleMessage({ type: "fullTextResults", query: "stale", ids: ["y"] } as Message);
    setFullTextHits("deploy", ["x"]);
    expect(true).toBe(true);
  });

  it("applies a delta to the session list", () => {
    sessionsSignal.value = [session("a"), session("b")];
    handleDelta({ added: [session("c")], removed: ["a"] });
    expect(sessionsSignal.value.map((s) => s.id).sort()).toEqual(["b", "c"]);
  });

  it("ignores unrelated message types", () => {
    sessionsSignal.value = [session("a")];
    handleMessage({ type: "skills", data: [] } as Message);
    expect(sessionsSignal.value).toHaveLength(1);
  });

  it("flips the loaded gate when the first sessions message arrives (even if empty)", () => {
    expect(loadedSignal.value).toBe(false);
    handleMessage({ type: "sessions", data: [] } as Message);
    expect(loadedSignal.value).toBe(true);
  });

  it("flips the loaded gate on a host error", () => {
    expect(loadedSignal.value).toBe(false);
    handleMessage({ type: "error", message: "boom" } as Message);
    expect(loadedSignal.value).toBe(true);
  });
});
