// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { makeConfigData } from "../../__tests__/fixtures";
import { SettingsView } from "./SettingsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("SettingsView", () => {
  it("renders the three pickers as native-look Dropdown triggers (no raw <select>)", () => {
    const { api } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    // The last native <select> in the app is gone.
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('.vsc-dropdown-trigger[aria-label="Model"]')).toBeTruthy();
    expect(
      container.querySelector('.vsc-dropdown-trigger[aria-label="Tool-use confirmation"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('.vsc-dropdown-trigger[aria-label="Reasoning effort"]'),
    ).toBeTruthy();
  });

  it("posts setSetting for the co-author toggle via the shared checkbox", () => {
    const { api, post } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    // The shared <Checkbox> mirrors its caption onto the native input's aria-label.
    const coauthor = container.querySelector(
      'input[type="checkbox"][aria-label=\'Include "Co-authored-by: Claude" trailer in commits\']',
    ) as HTMLInputElement;
    expect(coauthor).toBeTruthy();
    fireEvent.click(coauthor);
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "includeCoAuthoredBy",
      value: true,
      scope: "global",
    });
  });

  describe("free-text fields debounce the host write", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("posts setSetting for retention once, after the debounce, parsed as a number", () => {
      const { api, post } = setup();
      const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="Session retention in days"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "30" } });
      // Still within the debounce window — host untouched.
      expect(post).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({
        type: "setSetting",
        key: "cleanupPeriodDays",
        value: 30,
        scope: "global",
      });
    });

    it("coalesces a burst of attribution keystrokes into a single host write", () => {
      const { api, post } = setup();
      const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="Commit attribution"]',
      ) as HTMLInputElement;
      // Three quick keystrokes inside one debounce window.
      fireEvent.input(field, { target: { value: "C" } });
      fireEvent.input(field, { target: { value: "Co" } });
      fireEvent.input(field, { target: { value: "Co-" } });
      expect(post).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      // One write, with the latest value — not three per-keystroke round trips.
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({ type: "setCommitAttribution", value: "Co-" });
    });

    it("flushes a pending write on unmount so a mid-pause edit is not lost", () => {
      const { api, post } = setup();
      const { container, unmount } = render(<SettingsView data={makeConfigData()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="PR attribution"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "Generated" } });
      expect(post).not.toHaveBeenCalled();
      // Navigate away before the debounce fires.
      act(() => {
        unmount();
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({ type: "setPrAttribution", value: "Generated" });
    });
  });

  it("renders statusLineCommand as a read-only code block, not an editable input", () => {
    const { api } = setup();
    const cmd = "bash ~/.claude/statusline-command.sh";
    const data = makeConfigData({
      settings: { ...makeConfigData().settings, statusLineCommand: cmd },
    });
    const { container } = render(<SettingsView data={data} api={api} />);
    const code = container.querySelector("code.acct-code");
    expect(code).toBeTruthy();
    // Read-only code-block treatment (shared reusable class), not a TextField.
    expect(code?.classList.contains("code-readonly")).toBe(true);
    expect(code?.textContent).toBe(cmd);
    // Full value exposed via title for hover discovery when it scrolls.
    expect(code?.getAttribute("title")).toBe(cmd);
    // It is NOT rendered as an editable field.
    expect(
      container.querySelector('input[aria-label="Status line command"]'),
    ).toBeNull();
  });

  it("reset posts resetSettings via the danger button", () => {
    const { api, post } = setup();
    render(<SettingsView data={makeConfigData()} api={api} />);
    fireEvent.click(screen.getByText("Reset settings"));
    expect(post).toHaveBeenCalledWith({ type: "resetSettings", scope: "global" });
  });

  it("effort dropdown posts setSetting with the chosen tier", () => {
    const { api, post } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    // Open the effort Dropdown and choose the "High" tier from the Menu.
    const trigger = container.querySelector(
      '.vsc-dropdown-trigger[aria-label="Reasoning effort"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    const highRow = Array.from(container.querySelectorAll(".vsc-menu-label")).find(
      (l) => l.textContent === "High",
    ) as HTMLElement;
    fireEvent.click(highRow);
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "effortLevel",
      value: "high",
      scope: "global",
    });
  });
});
