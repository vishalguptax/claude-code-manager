// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { _resetConfigState } from "../../model";
import { choose, infoFor, toggle } from "../../__tests__/dom";
import { makeConfigData } from "../../__tests__/fixtures";
import { ModelSection } from "./ModelSection";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("ModelSection", () => {
  beforeEach(() => _resetConfigState());

  it("opens expanded, with the pickers as native-look Dropdown triggers", () => {
    const { api } = setup();
    const { container } = render(<ModelSection data={makeConfigData()} api={api} />);
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector('.vsc-dropdown-trigger[aria-label="Model"]')).toBeTruthy();
    expect(container.querySelector('.vsc-dropdown-trigger[aria-label="Reasoning effort"]')).toBeTruthy();
  });

  it("effort dropdown posts setSetting with the chosen tier", () => {
    const { api, post } = setup();
    const { container } = render(<ModelSection data={makeConfigData()} api={api} />);
    choose(container, "Reasoning effort", "High");
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "effortLevel",
      value: "high",
      scope: "global",
    });
  });

  // Background lives behind an InfoTip; nothing extra sits under the toggle.
  it("keeps the thinking explanation behind an InfoTip, not on screen", () => {
    const { api } = setup();
    const { container } = render(<ModelSection data={makeConfigData()} api={api} />);
    expect(infoFor(container, "Extended thinking")).toMatch(/lets each model decide/);
    expect(screen.queryByText(/lets each model decide/)).toBeNull();
  });

  it("writes an explicit false to turn thinking off, and clears it to re-enable", () => {
    const { api, post } = setup();
    const on = makeConfigData();
    on.settings.alwaysThinkingEnabled = true;
    const { container } = render(<ModelSection data={on} api={api} />);
    fireEvent.click(toggle(container, "Extended thinking"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "alwaysThinkingEnabled",
      value: false,
      scope: "global",
    });
  });
});
