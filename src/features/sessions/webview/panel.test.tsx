// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../shared/protocol/messages";
import { setVscodeApi } from "../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../webview/shared/model";
import {
  _resetSessionsSignals,
  detailSignal,
  pinnedSignal,
  selectedIdSignal,
  viewSignal,
} from "./model";
import { SessionPanel } from "./panel";

const post = vi.fn();

afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

beforeEach(() => {
  _resetMessageBus();
  _resetSessionsSignals();
  post.mockReset();
  setVscodeApi({ postMessage: post });
});

function detail(id: string) {
  return {
    id,
    name: `Session ${id}`,
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
    messages: [],
    totalMessages: 0,
  };
}

describe("SessionPanel", () => {
  it("opens on its own session and asks the host for state and the transcript", () => {
    render(h(SessionPanel, { sessionId: "s-1" }));
    expect(selectedIdSignal.value).toBe("s-1");
    expect(viewSignal.value).toBe("detail");
    expect(post).toHaveBeenCalledWith({ type: "ready" });
    expect(post).toHaveBeenCalledWith({
      type: "getSessionDetail",
      sessionId: "s-1",
      mode: "last",
      query: "",
    });
  });

  it("renders the detail standalone, without the sidebar's navigation", async () => {
    const { container } = render(h(SessionPanel, { sessionId: "s-1" }));
    dispatch({ type: "sessionDetail", data: detail("s-1") } as Message);
    await waitFor(() =>
      expect(container.querySelector(".d-title")?.textContent).toBe("Session s-1"),
    );
    expect(container.querySelector(".d-nav")).toBeNull();
  });

  it("applies host state pushes like the sidebar does", () => {
    render(h(SessionPanel, { sessionId: "s-1" }));
    dispatch({ type: "userState", pinned: ["s-1"] } as Message);
    expect(pinnedSignal.value.has("s-1")).toBe(true);
  });

  it("ignores detail another view asked for", () => {
    render(h(SessionPanel, { sessionId: "s-1" }));
    dispatch({ type: "sessionDetail", data: detail("s-2") } as Message);
    expect(detailSignal.value).toBeNull();
  });

  it("stays on its session when the sidebar sends navigateList", () => {
    render(h(SessionPanel, { sessionId: "s-1" }));
    dispatch({ type: "sessionDetail", data: detail("s-1") } as Message);
    dispatch({ type: "navigateList" } as Message);
    expect(selectedIdSignal.value).toBe("s-1");
    expect(detailSignal.value?.id).toBe("s-1");
  });
});
