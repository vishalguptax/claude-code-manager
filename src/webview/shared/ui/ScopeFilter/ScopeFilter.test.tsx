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
  it("renders one button per option in order", () => {
    const { container } = render(<ScopeFilter value="all" options={OPTS} onChange={() => {}} />);
    const btns = container.querySelectorAll(".scope-btn");
    expect(btns.length).toBe(3);
    expect(btns[0].textContent).toBe("All (10)");
    expect(btns[1].textContent).toBe("Project (4)");
  });

  it("omits the count when an option has none", () => {
    const { getByText } = render(<ScopeFilter value="all" options={OPTS} onChange={() => {}} />);
    expect(getByText("Global")).toBeTruthy();
  });

  it("marks the active option", () => {
    const { container } = render(
      <ScopeFilter value="project" options={OPTS} onChange={() => {}} />,
    );
    const active = container.querySelector(".scope-btn.active") as HTMLButtonElement;
    expect(active.textContent).toBe("Project (4)");
    expect(active.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    const { getByText } = render(<ScopeFilter value="all" options={OPTS} onChange={onChange} />);
    fireEvent.click(getByText("Project (4)"));
    expect(onChange).toHaveBeenCalledWith("project");
  });
});
