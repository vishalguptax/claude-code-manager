// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../types";
import { AgentDetailView, type AgentDetailViewProps } from "./AgentDetailView";

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

function props(overrides: Partial<AgentDetailViewProps> = {}): AgentDetailViewProps {
  return {
    agent: agent(),
    onBack: vi.fn(),
    onOpenFile: vi.fn(),
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe("AgentDetailView", () => {
  it("renders name, model badge, description, and path", () => {
    render(h(AgentDetailView, props()));
    expect(screen.getByText("reviewer")).toBeTruthy();
    expect(screen.getByText("opus")).toBeTruthy();
    expect(screen.getByText("reviews code")).toBeTruthy();
    expect(screen.getByText("/a/reviewer.md")).toBeTruthy();
  });

  it("strips frontmatter and shows the system prompt body", () => {
    const { container } = render(h(AgentDetailView, props()));
    const pre = container.querySelector(".agent-detail-pre");
    expect(pre?.textContent).toBe("You are a reviewer.");
  });

  it("omits the prompt block when body is empty", () => {
    const { container } = render(
      h(AgentDetailView, props({ agent: agent({ content: "---\nname: x\n---\n" }) })),
    );
    expect(container.querySelector(".agent-detail-content")).toBeNull();
  });

  it("omits description when empty", () => {
    const { container } = render(
      h(AgentDetailView, props({ agent: agent({ description: "" }) })),
    );
    expect(container.querySelector(".agent-detail-desc")).toBeNull();
  });

  it("shows Tools and Skills chip rows when present", () => {
    render(h(AgentDetailView, props({ agent: agent({ tools: ["Read", "Grep"], skills: ["research"] }) })));
    expect(screen.getByText("Tools")).toBeTruthy();
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("Grep")).toBeTruthy();
    expect(screen.getByText("Skills")).toBeTruthy();
    expect(screen.getByText("research")).toBeTruthy();
  });

  it("omits Tools and Skills rows when the agent has none", () => {
    render(h(AgentDetailView, props()));
    expect(screen.queryByText("Tools")).toBeNull();
    expect(screen.queryByText("Skills")).toBeNull();
  });

  it("fires onBack and onOpenFile", () => {
    const p = props();
    const { container } = render(h(AgentDetailView, p));
    fireEvent.click(container.querySelector(".back-btn") as Element);
    expect(p.onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Open File"));
    expect(p.onOpenFile).toHaveBeenCalledWith("/a/reviewer.md");
  });

  it("fires edit / duplicate / delete for editable agents", () => {
    const p = props();
    render(h(AgentDetailView, p));
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByText("Duplicate"));
    fireEvent.click(screen.getByText("Delete"));
    expect(p.onEdit).toHaveBeenCalledWith(p.agent);
    expect(p.onDuplicate).toHaveBeenCalledWith(p.agent);
    expect(p.onDelete).toHaveBeenCalledWith(p.agent);
  });

  it("hides edit/duplicate/delete and shows a note for plugin agents", () => {
    render(h(AgentDetailView, props({ agent: agent({ scope: "plugin", pluginName: "p@m" }) })));
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Duplicate")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    expect(screen.getByText(/Owned by plugin/)).toBeTruthy();
    // Open File stays available for plugin agents (read-only view).
    expect(screen.getByText("Open File")).toBeTruthy();
  });
});
