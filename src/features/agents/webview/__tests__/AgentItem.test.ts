// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../types";
import { AgentItem } from "../components/AgentItem";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "reviewer",
    description: "reviews code",
    model: "sonnet",
    path: "/a/reviewer.md",
    content: "body",
    scope: "global",
    ...overrides,
  };
}

describe("AgentItem", () => {
  it("renders name, model, and description", () => {
    render(h(AgentItem, { agent: agent(), active: false, onSelect: () => {} }));
    expect(screen.getByText("reviewer")).toBeTruthy();
    expect(screen.getByText("sonnet")).toBeTruthy();
    expect(screen.getByText("reviews code")).toBeTruthy();
  });

  it("truncates descriptions over 80 chars", () => {
    const long = "x".repeat(120);
    render(h(AgentItem, { agent: agent({ description: long }), active: false, onSelect: () => {} }));
    expect(screen.getByText(`${"x".repeat(80)}...`)).toBeTruthy();
  });

  it("omits the description node when empty", () => {
    const { container } = render(
      h(AgentItem, { agent: agent({ description: "" }), active: false, onSelect: () => {} }),
    );
    expect(container.querySelector(".agent-item-desc")).toBeNull();
  });

  it("fires onSelect with the agent on click", () => {
    const onSelect = vi.fn();
    const a = agent();
    render(h(AgentItem, { agent: a, active: false, onSelect }));
    fireEvent.click(screen.getByText("reviewer"));
    expect(onSelect).toHaveBeenCalledWith(a);
  });

  it("marks the active item", () => {
    const { container } = render(
      h(AgentItem, { agent: agent(), active: true, onSelect: () => {} }),
    );
    expect(container.querySelector(".agent-item.active")).toBeTruthy();
  });
});
