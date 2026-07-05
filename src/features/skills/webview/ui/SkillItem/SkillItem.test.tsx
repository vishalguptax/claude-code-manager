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
  render(
    h(SkillItem, {
      skill: makeSkill(over),
      active: false,
      chatEnabled: true,
      ...handlers,
      ...props,
    }),
  );
  return handlers;
}

describe("SkillItem", () => {
  it("renders the skill name and scope badge", () => {
    renderItem({ name: "lint", scope: "project" });
    expect(screen.getByText("lint")).toBeTruthy();
    expect(screen.getByText("project")).toBeTruthy();
  });

  it("renders the scope badge with the shared Badge chrome for cross-tab parity", () => {
    // The scope chip must ride the shared `.vsc-badge`/`.vsc-badge--scope`
    // primitive so its size matches the commands / MCP scope chips. Skills used
    // to layer an uppercase 18px override that made it the lone outlier; the
    // per-scope colour modifier (`scope-project`) is all skills adds now.
    renderItem({ scope: "project" });
    const badge = screen.getByText("project");
    expect(badge.classList.contains("vsc-badge")).toBe(true);
    expect(badge.classList.contains("vsc-badge--scope")).toBe(true);
    expect(badge.classList.contains("scope-project")).toBe(true);
  });

  it("truncates descriptions longer than 60 chars", () => {
    const long = "x".repeat(80);
    renderItem({ description: long });
    expect(screen.getByText(`${"x".repeat(60)}...`)).toBeTruthy();
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
