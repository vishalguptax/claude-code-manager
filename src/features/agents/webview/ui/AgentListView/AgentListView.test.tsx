// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../types";
import { agents, filterModel, resetAgentsState, searchQuery, selectedAgent } from "../../model";
import { AgentListView } from "./AgentListView";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "alpha",
    description: "an agent",
    model: "sonnet",
    path: `/a/${overrides.name ?? "alpha"}.md`,
    content: "body",
    scope: "global",
    ...overrides,
  };
}

beforeEach(() => {
  resetAgentsState();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AgentListView", () => {
  it("shows the all-empty state when there are no agents", () => {
    const { container } = render(h(AgentListView, { onRefresh: () => {} }));
    expect(container.querySelector(".agent-empty")).toBeTruthy();
    // No model filter row when there are no agents.
    expect(container.querySelector(".scope-filter")).toBeNull();
  });

  it("renders a grouped list with a count caption", () => {
    agents.value = [
      agent({ name: "p", scope: "project" }),
      agent({ name: "g", scope: "global" }),
    ];
    const { container } = render(h(AgentListView, { onRefresh: () => {} }));
    expect(screen.getByText("2 agents")).toBeTruthy();
    const labels = [...container.querySelectorAll(".group-label")].map((e) => e.textContent);
    expect(labels).toEqual(["Project", "Global"]);
    expect(container.querySelector(".scope-filter")).toBeTruthy();
  });

  it("uses singular wording for one agent", () => {
    agents.value = [agent({ name: "solo" })];
    render(h(AgentListView, { onRefresh: () => {} }));
    expect(screen.getByText("1 agent")).toBeTruthy();
  });

  it("shows a no-match state when the search filters everything out", () => {
    agents.value = [agent({ name: "alpha" })];
    searchQuery.value = "zzz";
    render(h(AgentListView, { onRefresh: () => {} }));
    expect(screen.getByText("No matching agents")).toBeTruthy();
  });

  it("selects an agent on click", () => {
    const a = agent({ name: "pick" });
    agents.value = [a];
    render(h(AgentListView, { onRefresh: () => {} }));
    fireEvent.click(screen.getByText("pick"));
    expect(selectedAgent.value?.path).toBe(a.path);
  });

  it("debounces search input into the searchQuery signal", () => {
    vi.useFakeTimers();
    agents.value = [agent({ name: "reviewer" })];
    const { container } = render(h(AgentListView, { onRefresh: () => {} }));
    const el = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(el, { target: { value: "REV" } });
    expect(searchQuery.value).toBe("");
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(searchQuery.value).toBe("rev");
  });

  it("fires onRefresh from the refresh button", () => {
    const onRefresh = vi.fn();
    agents.value = [agent()];
    render(h(AgentListView, { onRefresh }));
    fireEvent.click(screen.getByLabelText("Refresh agents"));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("changes the model filter", () => {
    agents.value = [agent({ name: "o", model: "opus" })];
    render(h(AgentListView, { onRefresh: () => {} }));
    fireEvent.click(screen.getByText("Opus (1)"));
    expect(filterModel.value).toBe("opus");
  });

  it("virtualizes lists over the threshold", () => {
    agents.value = Array.from({ length: 60 }, (_, i) =>
      agent({ name: `agent-${i}`, scope: "global" }),
    );
    const { container } = render(h(AgentListView, { onRefresh: () => {} }));
    // VirtualList wrapper present and count caption shown.
    expect(container.querySelector(".virtual-list")).toBeTruthy();
    expect(screen.getByText("60 agents")).toBeTruthy();
    // Windowing renders a subset, not all 60 rows.
    expect(container.querySelectorAll(".agent-item").length).toBeLessThan(60);
  });
});
