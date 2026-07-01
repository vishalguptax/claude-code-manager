// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../shared/protocol/messages";
import { setVscodeApi } from "../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../webview/shared/model";
import SessionsTab from "./index";
import { _resetSessionsSignals, detailLoadingSignal, viewSignal } from "./model";

afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

beforeEach(() => {
  _resetMessageBus();
  _resetSessionsSignals();
  setVscodeApi({ postMessage: vi.fn() });
});

describe("SessionsTab", () => {
  it("shows the content-shaped sessions skeleton before the first sessions message arrives", () => {
    const { container } = render(h(SessionsTab, {}));
    // The <SessionsSkeleton> mirrors the list shell (actions + search +
    // filters + session rows) — not the "No sessions yet" empty-state and not
    // a half-rendered list.
    expect(container.querySelector(".skeleton-panel")).toBeTruthy();
    expect(container.querySelector(".skeleton-list-rows > .session-item")).toBeTruthy();
    expect(container.querySelector("#listView")).toBeNull();
  });

  it("sends ready on mount so the host pushes the initial data", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    render(h(SessionsTab, {}));
    expect(post).toHaveBeenCalledWith({ type: "ready" });
  });

  it("shows the real empty-state (not the loader) after an empty sessions list loads", async () => {
    const { container } = render(h(SessionsTab, {}));
    dispatch({ type: "sessions", data: [] } as Message);
    await waitFor(() => {
      expect(container.querySelector(".skeleton-panel")).toBeNull();
    });
    expect(container.querySelector("#listView")).toBeTruthy();
    expect(container.textContent).toContain("No sessions yet");
  });

  it("renders the list once sessions arrive", async () => {
    const { container } = render(h(SessionsTab, {}));
    dispatch({
      type: "sessions",
      data: [
        {
          label: "Today",
          sessions: [
            {
              id: "s1",
              name: "First session",
              project: "proj",
              projectPath: "/p",
              branch: "main",
              entrypoint: "cli",
              startTime: 0,
              endTime: 0,
              messageCount: 1,
              summary: "hello",
              prompts: [],
              projectKey: "proj",
              searchHaystack: "",
            },
          ],
        },
      ],
    } as Message);
    await waitFor(() => {
      expect(container.querySelector(".skeleton-panel")).toBeNull();
    });
    expect(container.querySelector("#listView")).toBeTruthy();
  });

  it("shows the detail-panel skeleton while a transcript is in flight", () => {
    // Simulate clicking a row: detail view open, transcript request pending.
    viewSignal.value = "detail";
    detailLoadingSignal.value = true;
    const { container } = render(h(SessionsTab, {}));
    expect(container.querySelector("#detailView")).toBeTruthy();
    // Content-shaped detail skeleton (message blocks), with the Back affordance.
    expect(container.querySelector(".skeleton-detail")).toBeTruthy();
    expect(container.querySelector(".back-btn")).toBeTruthy();
  });
});
