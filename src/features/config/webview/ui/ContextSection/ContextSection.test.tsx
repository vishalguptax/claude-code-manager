// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { _resetConfigState, toggleSection } from "../../model";
import { toggle } from "../../__tests__/dom";
import { makeConfigData } from "../../__tests__/fixtures";
import { ContextSection } from "./ContextSection";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("ContextSection", () => {
  beforeEach(() => {
    _resetConfigState();
    // Folded by default; open it so its body is there to test.
    toggleSection("context");
  });

  it("starts folded, so the tab opens on model and permissions", () => {
    _resetConfigState();
    const { api } = setup();
    render(<ContextSection data={makeConfigData()} api={api} />);
    expect(screen.queryByText("Auto-compact")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sessions & context/i }));
    expect(screen.getByText("Auto-compact")).toBeTruthy();
  });

  it("writes an explicit false to turn a default-on key off, and clears it to re-enable", () => {
    // Writing `true` back would leave a line in settings.json that reads as
    // an intentional override of a value that was never changed.
    const { api, post } = setup();
    const on = makeConfigData();
    on.settings.autoCompactEnabled = true;
    const { container, unmount } = render(<ContextSection data={on} api={api} />);
    fireEvent.click(toggle(container, "Auto-compact"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "autoCompactEnabled",
      value: false,
      scope: "global",
    });
    unmount();

    const off = makeConfigData();
    off.settings.autoCompactEnabled = false;
    const second = setup();
    const r = render(<ContextSection data={off} api={second.api} />);
    fireEvent.click(toggle(r.container, "Auto-compact"));
    expect(second.post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "autoCompactEnabled",
      value: "",
      scope: "global",
    });
  });

  // The range and the default are what the user needs while typing, so those
  // stay on screen; nothing else does.
  it("keeps the valid range and the default visible under the number boxes", () => {
    const { api } = setup();
    render(<ContextSection data={makeConfigData()} api={api} />);
    expect(screen.getByText(/100,000 to 1,000,000/)).toBeTruthy();
    expect(screen.getByText(/default of 30/)).toBeTruthy();
  });

  describe("number boxes debounce the host write", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("posts retention once, after the debounce, parsed as a number", () => {
      const { api, post } = setup();
      const { container } = render(<ContextSection data={makeConfigData()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="Session retention in days"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "90" } });
      expect(post).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({
        type: "setSetting",
        key: "cleanupPeriodDays",
        value: 90,
        scope: "global",
      });
    });

    it("removes the compact window for anything that is not a positive number", () => {
      const { api, post } = setup();
      const { container } = render(<ContextSection data={makeConfigData()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="Auto-compact window in tokens"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "abc" } });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(post).toHaveBeenCalledWith({
        type: "setSetting",
        key: "autoCompactWindow",
        value: "",
        scope: "global",
      });
    });
  });
});
