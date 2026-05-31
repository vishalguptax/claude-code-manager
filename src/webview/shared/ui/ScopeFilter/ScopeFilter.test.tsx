// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { ScopeFilter, type ScopeOption } from "../ScopeFilter";

type Scope = "all" | "project" | "global";

const OPTS: ScopeOption<Scope>[] = [
  { value: "all", label: "All", count: 10 },
  { value: "project", label: "Project", count: 4 },
  { value: "global", label: "Global" },
];

describe("ScopeFilter", () => {
  it("renders one segment per option in order via the shared Segmented primitive", () => {
    const { container } = render(<ScopeFilter value="all" options={OPTS} onChange={() => {}} />);
    // Delegates to Segmented: rendered as a radiogroup carrying the scope-filter class.
    expect(container.querySelector('[role="radiogroup"].scope-filter')).toBeTruthy();
    const segs = container.querySelectorAll(".vsc-segmented-seg");
    expect(segs.length).toBe(3);
    expect(segs[0].textContent).toContain("All");
    expect(segs[0].textContent).toContain("10");
    expect(segs[1].textContent).toContain("Project");
  });

  it("omits the count when an option has none", () => {
    const { getByText } = render(<ScopeFilter value="all" options={OPTS} onChange={() => {}} />);
    expect(getByText("Global")).toBeTruthy();
  });

  it("marks the active option", () => {
    const { container } = render(
      <ScopeFilter value="project" options={OPTS} onChange={() => {}} />,
    );
    const active = container.querySelector(".vsc-segmented-seg.active") as HTMLButtonElement;
    expect(active.textContent).toContain("Project");
    expect(active.getAttribute("aria-checked")).toBe("true");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    const { getByText } = render(<ScopeFilter value="all" options={OPTS} onChange={onChange} />);
    fireEvent.click(getByText("Project (4)"));
    expect(onChange).toHaveBeenCalledWith("project");
  });
});
