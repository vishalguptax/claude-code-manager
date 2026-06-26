// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/preact";
import { Dropdown, type DropdownOption } from "../Dropdown";

const OPTS: DropdownOption[] = [
  { value: "a", label: "Alpha", badge: 3 },
  { value: "b", label: "Beta", marker: "current" },
];

describe("Dropdown", () => {
  it("renders a full-width trigger button showing the selected option's label and a chevron", () => {
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} ariaLabel="Pick" />,
    );
    const trigger = container.querySelector(
      '.vsc-dropdown-trigger[aria-label="Pick"]',
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".vsc-dropdown-label")?.textContent).toBe("Alpha");
    expect(container.querySelector('.vsc-dropdown-chevron [data-icon="chevron-down"]')).toBeTruthy();
  });

  it("appends the marker to the selected trigger label", () => {
    const { container } = render(<Dropdown value="b" options={OPTS} onChange={() => {}} />);
    expect(container.querySelector(".vsc-dropdown-label")?.textContent).toBe("Beta (current)");
  });

  it("renders a leading icon on the trigger when `icon` is given", () => {
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} icon="git-branch" />,
    );
    expect(container.querySelector('.vsc-dropdown-leading [data-icon="git-branch"]')).toBeTruthy();
  });

  it("omits the leading icon slot when no icon is given", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    expect(container.querySelector(".vsc-dropdown-leading")).toBeNull();
  });

  it("keeps the menu closed until the trigger is activated", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    expect(container.querySelector(".vsc-dropdown-menu")).toBeNull();
  });

  it("opens the Menu on trigger click, listing one row per option with the selected one checked", () => {
    const { container } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} ariaLabel="Pick" />,
    );
    const trigger = container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement;
    fireEvent.click(trigger);
    const menu = container.querySelector(".vsc-dropdown-menu");
    expect(menu).toBeTruthy();
    const rows = menu?.querySelectorAll(".vsc-menu-item") ?? [];
    expect(rows.length).toBe(2);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    // Selected row ("Alpha") carries the check glyph; the other does not.
    const checkRow = Array.from(rows).find((r) => r.querySelector('[data-icon="check"]'));
    expect(checkRow?.textContent).toContain("Alpha");
  });

  it("renders the badge as a trailing hint and the marker in the option label", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    fireEvent.click(container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement);
    const hints = Array.from(container.querySelectorAll(".vsc-menu-hint")).map((h) => h.textContent);
    expect(hints).toContain("3");
    const labels = Array.from(container.querySelectorAll(".vsc-menu-label")).map((l) => l.textContent);
    expect(labels).toContain("Beta (current)");
  });

  it("calls onChange with the chosen value and closes the menu", () => {
    const onChange = vi.fn();
    const { container, getByText } = render(
      <Dropdown value="a" options={OPTS} onChange={onChange} />,
    );
    fireEvent.click(container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement);
    fireEvent.click(getByText("Beta (current)"));
    expect(onChange).toHaveBeenCalledWith("b");
    // Menu closes after a selection.
    expect(container.querySelector(".vsc-dropdown-menu")).toBeNull();
  });

  it("does not call onChange when the already-selected option is chosen", () => {
    const onChange = vi.fn();
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={onChange} />);
    fireEvent.click(container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement);
    // Scope to the menu row (the trigger label also reads "Alpha").
    const alphaRow = Array.from(container.querySelectorAll(".vsc-menu-label")).find(
      (l) => l.textContent === "Alpha",
    ) as HTMLElement;
    fireEvent.click(alphaRow);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("optimistically shows the chosen option before the host echoes a new value", () => {
    // Settings dropdowns round-trip to the host; the trigger should reflect
    // the pick immediately (value prop stays "a" until the echo arrives).
    const { container, getByText } = render(
      <Dropdown value="a" options={OPTS} onChange={() => {}} />,
    );
    fireEvent.click(container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement);
    fireEvent.click(getByText("Beta (current)"));
    expect(container.querySelector(".vsc-dropdown-label")?.textContent).toBe("Beta (current)");
  });

  it("opens the menu via keyboard (ArrowDown / Enter / Space)", () => {
    const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
    const trigger = container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(container.querySelector(".vsc-dropdown-menu")).toBeTruthy();
  });

  describe("open/close behaviour (Bug 1)", () => {
    it("re-clicking the OPEN trigger closes it cleanly (no close-then-reopen)", () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
        const trigger = container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement;

        // First click opens.
        fireEvent.click(trigger);
        expect(container.querySelector(".vsc-dropdown-menu")).toBeTruthy();
        expect(trigger.getAttribute("aria-expanded")).toBe("true");

        // Let the Menu's outside-press listener attach.
        vi.advanceTimersByTime(1);

        // A real re-click is pointerdown (ignored — anchor excluded) then click
        // (toggles closed). The menu must end CLOSED, not flicker back open.
        fireEvent.pointerDown(trigger);
        fireEvent.click(trigger);
        expect(container.querySelector(".vsc-dropdown-menu")).toBeNull();
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
      } finally {
        vi.useRealTimers();
      }
    });

    it("a pointerdown anywhere outside closes the open menu", () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<Dropdown value="a" options={OPTS} onChange={() => {}} />);
        const trigger = container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement;
        fireEvent.click(trigger);
        expect(container.querySelector(".vsc-dropdown-menu")).toBeTruthy();

        vi.advanceTimersByTime(1);
        fireEvent.pointerDown(document.body);
        expect(container.querySelector(".vsc-dropdown-menu")).toBeNull();
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
      } finally {
        vi.useRealTimers();
      }
    });

    it("selecting an option closes the menu", () => {
      const onChange = vi.fn();
      const { container, getByText } = render(
        <Dropdown value="a" options={OPTS} onChange={onChange} />,
      );
      fireEvent.click(container.querySelector(".vsc-dropdown-trigger") as HTMLButtonElement);
      fireEvent.click(getByText("Beta (current)"));
      expect(onChange).toHaveBeenCalledWith("b");
      expect(container.querySelector(".vsc-dropdown-menu")).toBeNull();
    });
  });
});
