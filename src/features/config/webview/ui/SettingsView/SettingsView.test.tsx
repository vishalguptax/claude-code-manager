// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
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

  it("posts setSetting for retention via the shared text field", () => {
    const { api, post } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    const field = container.querySelector(
      'input[aria-label="Session retention in days"]',
    ) as HTMLInputElement;
    fireEvent.input(field, { target: { value: "30" } });
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "cleanupPeriodDays",
      value: 30,
      scope: "global",
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
