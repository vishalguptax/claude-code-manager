// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Message } from "../../../../shared/protocol/messages";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { Agent } from "../../types";
import AgentsTab from "../index";
import { resetAgentsState } from "../model";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "reviewer",
    description: "reviews code",
    model: "sonnet",
    path: "/a/reviewer.md",
    content: "---\nname: reviewer\n---\nbody",
    scope: "global",
    ...overrides,
  };
}

let posted: unknown[];

beforeEach(() => {
  posted = [];
  _resetMessageBus();
  resetAgentsState();
  setVscodeApi({ postMessage: (m) => posted.push(m) });
});
afterEach(() => {
  setVscodeApi(null);
  _resetMessageBus();
});

describe("AgentsTab", () => {
  it("requests agents on mount and shows loading first", () => {
    const { container } = render(h(AgentsTab, {}));
    expect(posted).toContainEqual({ type: "getAgents" });
    expect(container.querySelector(".skeleton-panel")).toBeTruthy();
  });

  it("renders the list once agents arrive", () => {
    render(h(AgentsTab, {}));
    act(() => dispatch({ type: "agents", data: [agent()] } as Message));
    expect(screen.getByText("reviewer")).toBeTruthy();
  });

  it("treats a null payload as an empty list", () => {
    render(h(AgentsTab, {}));
    act(() => dispatch({ type: "agents", data: null } as Message));
    expect(screen.getByText(/No agents found/)).toBeTruthy();
  });

  it("shows an error message on an error message", () => {
    render(h(AgentsTab, {}));
    act(() => dispatch({ type: "error", message: "kaboom" } as Message));
    expect(screen.getByText("Error: kaboom")).toBeTruthy();
  });

  it("surfaces host parse errors as a banner while still rendering agents", () => {
    render(h(AgentsTab, {}));
    act(() =>
      dispatch({
        type: "agents",
        data: [agent()],
        errors: ["Failed to read agent /a/broken.md: bad"],
      } as Message),
    );
    expect(screen.getByText("reviewer")).toBeTruthy();
    expect(screen.getByText("Failed to read agent /a/broken.md: bad")).toBeTruthy();
  });

  it("navigates to detail on click and back again", () => {
    const { container } = render(h(AgentsTab, {}));
    act(() => dispatch({ type: "agents", data: [agent()] } as Message));
    fireEvent.click(screen.getByText("reviewer"));
    // Detail view shows the path and an Open File action.
    expect(screen.getByText("/a/reviewer.md")).toBeTruthy();
    expect(screen.getByText("Open File")).toBeTruthy();

    fireEvent.click(screen.getByText("Back"));
    // Back on the list: the search row (shared SearchInput) is present again.
    expect(container.querySelector(".search-row input")).toBeTruthy();
  });

  it("posts openAgentFile from the detail view", () => {
    render(h(AgentsTab, {}));
    act(() => dispatch({ type: "agents", data: [agent()] } as Message));
    fireEvent.click(screen.getByText("reviewer"));
    posted.length = 0;
    fireEvent.click(screen.getByText("Open File"));
    expect(posted).toContainEqual({ type: "openAgentFile", path: "/a/reviewer.md" });
  });

  it("ignores messages for other features", () => {
    render(h(AgentsTab, {}));
    act(() => dispatch({ type: "skills", data: [] } as Message));
    // Still loading: no agents handler fired.
    expect(document.querySelector(".skeleton-panel")).toBeTruthy();
  });
});
