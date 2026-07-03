// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../types";
import { AgentDetailView } from "./AgentDetailView";

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

  it("shows Tools and Skills chip rows when present", () => {
    render(
      h(AgentDetailView, {
        agent: agent({ tools: ["Read", "Grep"], skills: ["research"] }),
        onBack: () => {},
        onOpenFile: () => {},
      }),
    );
    expect(screen.getByText("Tools")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("Grep")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("research")).toBeTruthy();
  });

  it("omits Tools and Skills rows when the agent has none", () => {
    render(h(AgentDetailView, { agent: agent(), onBack: () => {}, onOpenFile: () => {} }));
    expect(screen.queryByText("Tools")).toBeNull();
    expect(screen.queryByText("Skills")).toBeNull();
  });

  it("fires onBack and onOpenFile", () => {
    const onBack = vi.fn();
    const onOpenFile = vi.fn();
    const { container } = render(h(AgentDetailView, { agent: agent(), onBack, onOpenFile }));
    fireEvent.click(container.querySelector(".back-btn") as Element);
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open File"));
    expect(onOpenFile).toHaveBeenCalledWith("/a/reviewer.md");
  });
});
