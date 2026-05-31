// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Segmented, type SegmentedOption } from "../Segmented";

type Scope = "all" | "project" | "global";

const OPTS: SegmentedOption<Scope>[] = [
  { value: "all", label: "All", count: 10 },
  { value: "project", label: "Project", count: 4 },
  { value: "global", label: "Global" },
];

describe("Segmented", () => {
  it("renders a radiogroup with one radio segment per option, in order", () => {
    const { container } = render(
      <Segmented value="all" options={OPTS} onChange={() => {}} ariaLabel="Scope" />,
    );
    const group = container.querySelector('[role="radiogroup"][aria-label="Scope"]');
    expect(group).toBeTruthy();
    const segs = container.querySelectorAll('[role="radio"]');
    expect(segs.length).toBe(3);
    expect(segs[0].textContent).toContain("All");
    expect(segs[1].textContent).toContain("Project");
    expect(segs[2].textContent).toContain("Global");
  });

  it("renders the count in the legacy `Label (count)` shape and omits it otherwise", () => {
    const { getByText } = render(<Segmented value="all" options={OPTS} onChange={() => {}} />);
    // Counted options read "Label (count)"; "Global" has no count so it is bare.
    expect(getByText("All (10)")).toBeTruthy();
    expect(getByText("Project (4)")).toBeTruthy();
    expect(getByText("Global")).toBeTruthy();
  });

  it("marks the selected segment active with aria-checked and roving tabindex", () => {
    const { container } = render(
      <Segmented value="project" options={OPTS} onChange={() => {}} />,
    );
    const active = container.querySelector(".vsc-segmented-seg.active") as HTMLButtonElement;
    expect(active.textContent).toContain("Project");
    expect(active.getAttribute("aria-checked")).toBe("true");
    expect(active.getAttribute("tabindex")).toBe("0");
    // Non-selected segments are removed from the tab order.
    const others = Array.from(container.querySelectorAll(".vsc-segmented-seg")).filter(
      (b) => !b.classList.contains("active"),
    );
    expect(others.every((b) => b.getAttribute("tabindex") === "-1")).toBe(true);
  });

  it("does NOT use the primary-blue button background for the selected segment", () => {
    // Guards the core design-system rule: selected state is the subtle role
    // token, never the primary button background. We assert via class contract
    // (happy-dom does not apply stylesheets) — the active segment must carry
    // the segmented class, not any `.btn-primary`/`.primary` blue treatment.
    const { container } = render(
      <Segmented value="all" options={OPTS} onChange={() => {}} />,
    );
    const active = container.querySelector(".vsc-segmented-seg.active") as HTMLButtonElement;
    expect(active.className).not.toMatch(/\bbtn-primary\b|\bprimary\b/);
  });

  it("calls onChange with the clicked segment's value", () => {
    const onChange = vi.fn();
    const { getByText } = render(<Segmented value="all" options={OPTS} onChange={onChange} />);
    fireEvent.click(getByText("Project (4)"));
    expect(onChange).toHaveBeenCalledWith("project");
  });

  it("does not call onChange when the already-selected segment is clicked", () => {
    const onChange = vi.fn();
    const { getByText } = render(<Segmented value="all" options={OPTS} onChange={onChange} />);
    fireEvent.click(getByText("All (10)"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves selection with ArrowRight/ArrowLeft, wrapping at the ends", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <Segmented value="all" options={OPTS} onChange={onChange} />,
    );
    const active = () => container.querySelector(".vsc-segmented-seg.active") as HTMLButtonElement;
    fireEvent.keyDown(active(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("project");

    // ArrowLeft from the first option wraps to the last.
    rerender(<Segmented value="all" options={OPTS} onChange={onChange} />);
    fireEvent.keyDown(active(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("global");
  });

  it("jumps to the ends with Home and End", () => {
    const onChange = vi.fn();
    const { container } = render(
      <Segmented value="project" options={OPTS} onChange={onChange} />,
    );
    const active = container.querySelector(".vsc-segmented-seg.active") as HTMLButtonElement;
    fireEvent.keyDown(active, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("all");
    fireEvent.keyDown(active, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("global");
  });

  it("applies the compact size modifier when size='sm'", () => {
    const { container } = render(
      <Segmented value="all" options={OPTS} onChange={() => {}} size="sm" />,
    );
    expect(container.querySelector(".vsc-segmented--sm")).toBeTruthy();
  });

  describe("disabled", () => {
    it("marks the group disabled, drops every segment from the tab order, and disables the buttons", () => {
      const { container } = render(
        <Segmented value="all" options={OPTS} onChange={() => {}} disabled />,
      );
      const group = container.querySelector(".vsc-segmented") as HTMLElement;
      expect(group.classList.contains("is-disabled")).toBe(true);
      expect(group.getAttribute("aria-disabled")).toBe("true");
      const segs = Array.from(
        container.querySelectorAll<HTMLButtonElement>(".vsc-segmented-seg"),
      );
      // Even the active segment leaves the tab order while disabled.
      expect(segs.every((b) => b.getAttribute("tabindex") === "-1")).toBe(true);
      expect(segs.every((b) => b.disabled)).toBe(true);
    });

    it("does not call onChange when a disabled segment is clicked", () => {
      const onChange = vi.fn();
      const { getByText } = render(
        <Segmented value="all" options={OPTS} onChange={onChange} disabled />,
      );
      fireEvent.click(getByText("Project (4)"));
      expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores arrow-key navigation while disabled", () => {
      const onChange = vi.fn();
      const { container } = render(
        <Segmented value="all" options={OPTS} onChange={onChange} disabled />,
      );
      const first = container.querySelector(".vsc-segmented-seg") as HTMLButtonElement;
      fireEvent.keyDown(first, { key: "ArrowRight" });
      fireEvent.keyDown(first, { key: "End" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("omits aria-disabled and is-disabled when enabled (the default)", () => {
      const { container } = render(<Segmented value="all" options={OPTS} onChange={() => {}} />);
      const group = container.querySelector(".vsc-segmented") as HTMLElement;
      expect(group.classList.contains("is-disabled")).toBe(false);
      expect(group.getAttribute("aria-disabled")).toBeNull();
    });
  });
});
