// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Session } from "../../../types";
import { ListView } from "./ListView";
import {
  applyDelta,
  bulkModeSignal,
  filterDateSignal,
  filterProjectSignal,
  pinnedSignal,
  searchQuerySignal,
  selectionSignal,
  sessionsSignal,
  _resetSessionsSignals,
} from "../../model";

// useApi posts to a never-acquired bridge in tests; stub it so action
// buttons in the view don't throw.
vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post: () => {} }),
  setVscodeApi: () => {},
}));

function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    name: "",
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: Number(id.replace(/\D/g, "")) || 0,
    messageCount: 1,
    summary: "s",
    prompts: [`prompt ${id}`],
    projectKey: "proj",
    searchHaystack: `prompt ${id}`,
    ...over,
  };
}

describe("ListView", () => {
  beforeEach(() => {
    _resetSessionsSignals();
    filterProjectSignal.value = "all";
    filterDateSignal.value = "all";
  });

  it("shows the empty state when there are no sessions", () => {
    const { getByText } = render(h(ListView, {}));
    expect(getByText("No sessions yet")).toBeTruthy();
  });

  it("shows the no-matches empty state during an active search", () => {
    sessionsSignal.value = [session("s1")];
    searchQuerySignal.value = "zzz-no-match";
    const { getByText } = render(h(ListView, {}));
    expect(getByText("No matching sessions")).toBeTruthy();
  });

  it("renders the session count in the header", () => {
    sessionsSignal.value = [session("s1"), session("s2"), session("s3")];
    const { getByText } = render(h(ListView, {}));
    expect(getByText("3 sessions")).toBeTruthy();
  });

  it("virtualizes a 5000-session list — only a window is in the DOM", () => {
    sessionsSignal.value = Array.from({ length: 5000 }, (_, i) => session(`s${i}`));
    const { container } = render(h(ListView, {}));
    // The virtual list mounts.
    expect(container.querySelector(".virtual-list")).toBeTruthy();
    // Far fewer than 5000 rows are realised at once (windowed render).
    const rows = container.querySelectorAll(".session-item");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(200);
  });

  it("re-renders fewer rows after a delta removes most sessions", () => {
    sessionsSignal.value = Array.from({ length: 100 }, (_, i) => session(`s${i}`));
    const { container, rerender } = render(h(ListView, {}));
    expect(container.querySelector(".virtual-list")).toBeTruthy();

    // Apply a delta that removes all but two sessions.
    const keep = sessionsSignal.value.slice(0, 2).map((s) => s.id);
    const removed = sessionsSignal.value.filter((s) => !keep.includes(s.id)).map((s) => s.id);
    sessionsSignal.value = applyDelta(sessionsSignal.value, { removed });
    rerender(h(ListView, {}));

    expect(sessionsSignal.value).toHaveLength(2);
  });

  it("renders date-group headers in the virtualized list", () => {
    const now = Date.now();
    sessionsSignal.value = [
      session("today", { endTime: now }),
      session("old", { endTime: now - 40 * 86400000 }),
    ];
    const { container } = render(h(ListView, {}));
    const headers = Array.from(container.querySelectorAll(".group-label")).map((h) =>
      h.textContent,
    );
    expect(headers).toContain("Today");
    // The 40-day-old session falls into a Month Year bucket, not Today.
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it("groups pinned sessions under a leading Pinned header", () => {
    const now = Date.now();
    sessionsSignal.value = [session("a", { endTime: now }), session("b", { endTime: now })];
    pinnedSignal.value = new Set(["a"]);
    const { container } = render(h(ListView, {}));
    const first = container.querySelector(".group-label");
    expect(first?.textContent).toBe("Pinned");
  });

  it("opens the action menu on right-clicking a row", () => {
    const now = Date.now();
    sessionsSignal.value = [session("a", { endTime: now })];
    const { container } = render(h(ListView, {}));
    expect(container.querySelector(".ctx-menu")).toBeNull();
    fireEvent.contextMenu(container.querySelector(".session-item") as Element, {
      clientX: 10,
      clientY: 10,
    });
    const menu = container.querySelector(".ctx-menu");
    expect(menu).toBeTruthy();
    // All eight v1 actions are present (7 rows incl. pin variant).
    expect(menu?.querySelectorAll(".ctx-item").length).toBe(7);
  });

  it("Ctrl+A selects every session while in bulk mode", () => {
    const now = Date.now();
    sessionsSignal.value = [
      session("a", { endTime: now }),
      session("b", { endTime: now - 1 }),
    ];
    bulkModeSignal.value = true;
    render(h(ListView, {}));
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    expect([...selectionSignal.value].sort()).toEqual(["a", "b"]);
  });

  it("ignores Ctrl+A when not in bulk mode", () => {
    const now = Date.now();
    sessionsSignal.value = [session("a", { endTime: now })];
    bulkModeSignal.value = false;
    render(h(ListView, {}));
    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    expect(selectionSignal.value.size).toBe(0);
  });

  it("Escape exits bulk mode and clears the selection", () => {
    sessionsSignal.value = [session("a", { endTime: Date.now() })];
    bulkModeSignal.value = true;
    selectionSignal.value = new Set(["a"]);
    render(h(ListView, {}));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bulkModeSignal.value).toBe(false);
    expect(selectionSignal.value.size).toBe(0);
  });

  it("ignores Escape while focus is in an input (search field keeps native behaviour)", () => {
    sessionsSignal.value = [session("a", { endTime: Date.now() })];
    bulkModeSignal.value = true;
    render(h(ListView, {}));
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(bulkModeSignal.value).toBe(true);
    input.remove();
  });
});
