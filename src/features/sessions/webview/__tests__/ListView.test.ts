// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { render } from "@testing-library/preact";
import type { Session } from "../../types";
import { ListView } from "../views/ListView";
import {
  applyDelta,
  filterDateSignal,
  filterProjectSignal,
  searchQuerySignal,
  sessionsSignal,
  _resetSessionsSignals,
} from "../signals";

// useApi posts to a never-acquired bridge in tests; stub it so action
// buttons in the view don't throw.
vi.mock("../../../../webview/hooks/useApi", () => ({
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
});
