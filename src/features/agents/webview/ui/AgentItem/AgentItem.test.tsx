// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import type { Agent } from "../../../types";
import { AgentItem } from "./AgentItem";

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

  // `.agent-item-desc` ellipsizes at the row edge; a character count here
  // could only ever be wrong at some sidebar width, and truncated twice.
  it("renders the full description and exposes it on hover", () => {
    const long = "x".repeat(120);
    const { container } = render(
      h(AgentItem, { agent: agent({ description: long }), active: false, onSelect: () => {} }),
    );
    const desc = container.querySelector(".agent-item-desc");
    expect(desc?.textContent).toBe(long);
    expect(desc?.getAttribute("title")).toBe(long);
  });

  it("omits the description node when empty", () => {
    const { container } = render(
      h(AgentItem, { agent: agent({ description: "" }), active: false, onSelect: () => {} }),
    );
    expect(container.querySelector(".agent-item-desc")).toBeNull();
  });

  it("shows a validity dot only when the description is blank", () => {
    const withDesc = render(h(AgentItem, { agent: agent(), active: false, onSelect: () => {} }));
    expect(withDesc.container.querySelector(".agent-validity-dot")).toBeNull();

    const blank = render(
      h(AgentItem, { agent: agent({ description: "  " }), active: false, onSelect: () => {} }),
    );
    expect(blank.container.querySelector(".agent-validity-dot")).toBeTruthy();
    expect(blank.container.querySelector(".agent-validity-dot")?.getAttribute("aria-label")).toMatch(
      /no description/i,
    );
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

  // ── Tool grants ─────────────────────────────────────────────────────
  // Which tools an agent holds is the second thing you want to know about it,
  // and it used to require opening the detail view.

  it("lists the agent's tools", () => {
    const { container } = render(
      h(AgentItem, {
        agent: agent({ tools: ["Read", "Grep"] }),
        active: false,
        onSelect: () => {},
      }),
    );
    const chips = [...container.querySelectorAll(".agent-item-tools .vsc-badge")].map(
      (n) => n.textContent,
    );
    expect(chips).toEqual(["Read", "Grep"]);
  });

  it("folds a long tool list into a count and keeps the full list on hover", () => {
    const tools = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"];
    const { container } = render(
      h(AgentItem, { agent: agent({ tools }), active: false, onSelect: () => {} }),
    );
    const chips = [...container.querySelectorAll(".agent-item-tools .vsc-badge")].map(
      (n) => n.textContent,
    );
    expect(chips).toEqual(["Read", "Write", "Edit", "Glob", "+2"]);
    expect(container.querySelector(".agent-item-tools")?.getAttribute("title")).toBe(
      "Tools: Read, Write, Edit, Glob, Grep, Bash",
    );
  });

  // No `tools` in the frontmatter means the agent inherits the full set. That
  // is the unremarkable default, so it says nothing rather than claiming
  // "everything" in a chip.
  it("shows nothing when the agent does not restrict its tools", () => {
    const { container } = render(
      h(AgentItem, { agent: agent({ tools: undefined }), active: false, onSelect: () => {} }),
    );
    expect(container.querySelector(".agent-item-tools")).toBeNull();
  });
});
