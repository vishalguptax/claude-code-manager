// @vitest-environment happy-dom
import { h } from "preact";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeSkill } from "../../__tests__/fixtures";
import { SkillItem } from "./SkillItem";

afterEach(cleanup);

function renderItem(over = {}, props = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onCopy: vi.fn(),
    onLaunchChat: vi.fn(),
  };
  // `container` rides alongside the handlers so a test can assert on a node's
  // attributes (a title, a class) rather than only on its visible text.
  const { container } = render(
    h(SkillItem, {
      skill: makeSkill(over),
      active: false,
      chatEnabled: true,
      ...handlers,
      ...props,
    }),
  );
  return { ...handlers, container };
}

describe("SkillItem", () => {
  it("renders the skill name and scope badge", () => {
    renderItem({ name: "lint", scope: "project" });
    expect(screen.getByText("lint")).toBeTruthy();
    expect(screen.getByText("project")).toBeTruthy();
  });

  it("renders the scope badge with the shared Badge chrome for cross-tab parity", () => {
    // The scope chip rides the shared primitive so its size AND colour match
    // the commands / MCP / hooks chips. Both come from <Badge scope="…">;
    // skills contributes only a shrink guard.
    renderItem({ scope: "project" });
    const badge = screen.getByText("project");
    expect(badge.classList.contains("vsc-badge")).toBe(true);
    expect(badge.classList.contains("vsc-badge--scope")).toBe(true);
    expect(badge.classList.contains("vsc-badge--scope-project")).toBe(true);
  });

  // `.item-prompt` ellipsizes at the row edge; the old 60-character cut
  // clipped mid-word at a width the component cannot know.
  it("renders the full description and exposes it on hover", () => {
    const long = "x".repeat(80);
    const { container } = renderItem({ description: long });
    const desc = container.querySelector(".item-prompt");
    expect(desc?.textContent).toBe(long);
    expect(desc?.getAttribute("title")).toBe(long);
  });

  it("renders tags", () => {
    renderItem({ tags: ["a", "b"] });
    expect(screen.getByText("a")).toBeTruthy();
    expect(screen.getByText("b")).toBeTruthy();
  });

  it("calls onSelect when the row is clicked", () => {
    const h2 = renderItem({ id: "global:lint" });
    const row = document.querySelector(".skill-item") as HTMLElement;
    fireEvent.click(row);
    expect(h2.onSelect).toHaveBeenCalledWith("global:lint");
  });

  it("calls onSelect on Enter key", () => {
    const h2 = renderItem({ id: "global:lint" });
    const row = document.querySelector(".skill-item") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(h2.onSelect).toHaveBeenCalledWith("global:lint");
  });

  it("copy button calls onCopy and stops propagation (no select)", () => {
    const h2 = renderItem({ name: "lint" });
    fireEvent.click(screen.getByTitle("Copy /lint"));
    expect(h2.onCopy).toHaveBeenCalledWith("lint");
    expect(h2.onSelect).not.toHaveBeenCalled();
  });

  it("icon-only chat and copy buttons have an accessible name", () => {
    renderItem({ name: "lint" });
    expect(screen.getByLabelText("Copy /lint")).toBeTruthy();
    expect(screen.getByLabelText("Launch /lint in Claude Code chat")).toBeTruthy();
  });

  it("shows the chat button only when chatEnabled", () => {
    renderItem({ name: "lint" }, { chatEnabled: false });
    expect(screen.queryByTitle(/Launch \/lint/)).toBeNull();
  });

  it("chat button calls onLaunchChat without selecting", () => {
    const h2 = renderItem({ name: "lint" });
    fireEvent.click(screen.getByTitle("Launch /lint in Claude Code chat"));
    expect(h2.onLaunchChat).toHaveBeenCalledWith("lint");
    expect(h2.onSelect).not.toHaveBeenCalled();
  });

  it("applies the active class when active", () => {
    render(
      h(SkillItem, {
        skill: makeSkill(),
        active: true,
        chatEnabled: false,
        onSelect: vi.fn(),
        onCopy: vi.fn(),
        onLaunchChat: vi.fn(),
      }),
    );
    expect(document.querySelector(".skill-item.active")).toBeTruthy();
  });
});
