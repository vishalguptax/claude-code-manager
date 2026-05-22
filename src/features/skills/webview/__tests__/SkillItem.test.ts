// @vitest-environment happy-dom
import { h } from "preact";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillItem } from "../components/SkillItem";
import { makeSkill } from "./fixtures";

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
