// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../types";
import { AgentDetailView } from "../views/AgentDetailView";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "reviewer",
    description: "reviews code",
    model: "opus",
    path: "/a/reviewer.md",
    content: "---\nname: reviewer\nmodel: opus\n---\nYou are a reviewer.",
    scope: "global",
    ...overrides,
  };
}

describe("AgentDetailView", () => {
  it("renders name, model badge, description, and path", () => {
    render(h(AgentDetailView, { agent: agent(), onBack: () => {}, onOpenFile: () => {} }));
    expect(screen.getByText("reviewer")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
    expect(screen.getByText("reviews code")).toBeTruthy();
    expect(screen.getByText("/a/reviewer.md")).toBeTruthy();
  });

  it("strips frontmatter and shows the system prompt body", () => {
    const { container } = render(
      h(AgentDetailView, { agent: agent(), onBack: () => {}, onOpenFile: () => {} }),
    );
    const pre = container.querySelector(".agent-detail-pre");
    expect(pre?.textContent).toBe("You are a reviewer.");
  });

  it("omits the prompt block when body is empty", () => {
    const { container } = render(
      h(AgentDetailView, {
        agent: agent({ content: "---\nname: x\n---\n" }),
        onBack: () => {},
        onOpenFile: () => {},
      }),
    );
    expect(container.querySelector(".agent-detail-content")).toBeNull();
  });

  it("omits description when empty", () => {
    const { container } = render(
      h(AgentDetailView, {
        agent: agent({ description: "" }),
        onBack: () => {},
        onOpenFile: () => {},
      }),
    );
    expect(container.querySelector(".agent-detail-desc")).toBeNull();
  });

  it("fires onBack and onOpenFile", () => {
    const onBack = vi.fn();
    const onOpenFile = vi.fn();
    const { container } = render(
      h(AgentDetailView, { agent: agent(), onBack, onOpenFile }),
    );
    fireEvent.click(container.querySelector(".back-btn") as Element);
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open File"));
    expect(onOpenFile).toHaveBeenCalledWith("/a/reviewer.md");
  });
});
