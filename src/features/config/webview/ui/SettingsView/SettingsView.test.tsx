// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { makeConfigData } from "../../__tests__/fixtures";
import { SettingsView } from "./SettingsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

/** vscode-checkbox/textfield/single-select expose state as PROPERTIES. */
interface ValueEl extends HTMLElement {
  value: string;
}
interface CheckedEl extends HTMLElement {
  checked: boolean;
}

describe("SettingsView", () => {
  it("renders the three pickers as native-look dropdowns (no raw <select>)", () => {
    const { api } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    // The last native <select> in the app is gone.
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('vscode-single-select[aria-label="Model"]')).toBeTruthy();
    expect(
      container.querySelector('vscode-single-select[aria-label="Tool-use confirmation"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('vscode-single-select[aria-label="Reasoning effort"]'),
    ).toBeTruthy();
  });

  it("posts setSetting for the co-author toggle via the shared checkbox", () => {
    const { api, post } = setup();
    const { container } = render(<SettingsView data={makeConfigData()} api={api} />);
    // vscode-checkbox carries its caption on the `label` property (Shadow DOM).
    const coauthor = Array.from(
      container.querySelectorAll("vscode-checkbox"),
    ).find(
      (el) =>
        (el as HTMLElement & { label?: string }).label ===
        'Include "Co-authored-by: Claude" trailer in commits',
    ) as CheckedEl;
    expect(coauthor).toBeTruthy();
    vi.spyOn(coauthor, "checked", "get").mockReturnValue(true);
    fireEvent(coauthor, new Event("change"));
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
      'vscode-textfield[aria-label="Session retention in days"]',
    ) as ValueEl;
    vi.spyOn(field, "value", "get").mockReturnValue("30");
    fireEvent(field, new Event("input"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "cleanupPeriodDays",
      value: 30,
      scope: "global",
    });
  });

  it("renders statusLineCommand read-only when present", () => {
    const { api } = setup();
    const data = makeConfigData({
      settings: { ...makeConfigData().settings, statusLineCommand: "echo hi" },
    });
    render(<SettingsView data={data} api={api} />);
    expect(screen.getByText("echo hi")).toBeTruthy();
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
    const effort = container.querySelector(
      'vscode-single-select[aria-label="Reasoning effort"]',
    ) as ValueEl;
    vi.spyOn(effort, "value", "get").mockReturnValue("high");
    fireEvent(effort, new Event("change"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "effortLevel",
      value: "high",
      scope: "global",
    });
  });
});
