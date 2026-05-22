// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it, vi } from "vitest";
import { ModelFilter } from "../components/ModelFilter";

const counts = { all: 5, sonnet: 2, opus: 2, haiku: 1 };

describe("ModelFilter", () => {
  it("renders a button per model with counts", () => {
    render(h(ModelFilter, { value: "all", counts, onChange: () => {} }));
    expect(screen.getByText("All (5)")).toBeTruthy();
    expect(screen.getByText("Sonnet (2)")).toBeTruthy();
    expect(screen.getByText("Opus (2)")).toBeTruthy();
    expect(screen.getByText("Haiku (1)")).toBeTruthy();
  });

  it("marks the active value", () => {
    render(h(ModelFilter, { value: "opus", counts, onChange: () => {} }));
    expect(screen.getByText("Opus (2)").className).toContain("active");
    expect(screen.getByText("All (5)").className).not.toContain("active");
  });

  it("calls onChange with the chosen value", () => {
    const onChange = vi.fn();
    render(h(ModelFilter, { value: "all", counts, onChange }));
    fireEvent.click(screen.getByText("Haiku (1)"));
    expect(onChange).toHaveBeenCalledWith("haiku");
  });
});
