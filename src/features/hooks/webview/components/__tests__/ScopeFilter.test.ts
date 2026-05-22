// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { h } from "preact";
import { render, screen, fireEvent } from "@testing-library/preact";
import { ScopeFilter } from "../ScopeFilter";

function renderFilter(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  render(
    h(ScopeFilter, {
      active: "all",
      total: 5,
      globalCount: 2,
      projectCount: 2,
      localCount: 1,
      pluginCount: 0,
      onChange,
      ...overrides,
    }),
  );
  return { onChange };
}

describe("ScopeFilter", () => {
  it("renders counts for each scope", () => {
    renderFilter();
    expect(screen.getByText("All (5)")).toBeTruthy();
    expect(screen.getByText("Global (2)")).toBeTruthy();
    expect(screen.getByText("Project (2)")).toBeTruthy();
    expect(screen.getByText("Local (1)")).toBeTruthy();
  });

  it("hides the Plugin pill when there are no plugin hooks", () => {
    renderFilter({ pluginCount: 0 });
    expect(screen.queryByText(/^Plugin/)).toBeNull();
  });

  it("shows the Plugin pill when plugin hooks exist", () => {
    renderFilter({ pluginCount: 3 });
    expect(screen.getByText("Plugin (3)")).toBeTruthy();
  });

  it("marks the active scope", () => {
    renderFilter({ active: "global" });
    expect(screen.getByText("Global (2)").className).toContain("active");
    expect(screen.getByText("All (5)").className).not.toContain("active");
  });

  it("fires onChange with the clicked scope", () => {
    const { onChange } = renderFilter();
    fireEvent.click(screen.getByText("Local (1)"));
    expect(onChange).toHaveBeenCalledWith("local");
  });
});
