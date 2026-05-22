// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/preact";
import { h } from "preact";
import { ScopeFilter } from "../components/ScopeFilter";

const base = {
  active: "all" as const,
  total: 10,
  builtinCount: 4,
  projectCount: 3,
  globalCount: 3,
  pluginCount: 0,
  onChange: () => {},
};

describe("ScopeFilter", () => {
  it("renders All/Built-in/Project/Global with counts and omits Plugin when none exist", () => {
    const { container } = render(h(ScopeFilter, base));
    const labels = Array.from(container.querySelectorAll(".scope-btn")).map((b) => b.textContent);
    expect(labels).toEqual(["All (10)", "Built-in (4)", "Project (3)", "Global (3)"]);
  });

  it("shows the Plugin button when plugin commands exist", () => {
    const { container } = render(h(ScopeFilter, { ...base, pluginCount: 2 }));
    const labels = Array.from(container.querySelectorAll(".scope-btn")).map((b) => b.textContent);
    expect(labels).toContain("Plugin (2)");
  });

  it("marks the active scope button", () => {
    const { container } = render(h(ScopeFilter, { ...base, active: "project" }));
    const active = container.querySelector(".scope-btn.active");
    expect(active?.textContent).toBe("Project (3)");
  });

  it("fires onChange with the chosen scope", () => {
    const onChange = vi.fn();
    const { container } = render(h(ScopeFilter, { ...base, onChange }));
    const buttons = container.querySelectorAll(".scope-btn");
    fireEvent.click(buttons[1] as Element); // Built-in
    expect(onChange).toHaveBeenCalledWith("builtin");
  });
});
