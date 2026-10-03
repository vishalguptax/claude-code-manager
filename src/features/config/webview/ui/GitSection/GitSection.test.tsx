// @vitest-environment happy-dom
import { act, fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { _resetConfigState, toggleSection } from "../../model";
import { choose, findToggle, infoFor, triggerLabel } from "../../__tests__/dom";
import { makeConfigData } from "../../__tests__/fixtures";
import { GitSection } from "./GitSection";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

/** Fixture with both attribution keys in "custom" mode. */
function customAttribution() {
  const d = makeConfigData();
  d.settings.commitAttributionSet = true;
  d.settings.commitAttribution = "Co-authored-by: Claude";
  d.settings.prAttributionSet = true;
  d.settings.prAttribution = "Generated with Claude Code";
  return d;
}

describe("GitSection", () => {
  beforeEach(() => {
    _resetConfigState();
    toggleSection("git");
  });

  it("no longer offers the deprecated co-author checkbox", () => {
    // Claude Code marks includeCoAuthoredBy "Deprecated: use attribution
    // instead", and the attribution fields do the same job. Two controls
    // for one outcome, where the legacy one silently wins, is the bug.
    const { api } = setup();
    const { container } = render(<GitSection data={makeConfigData()} api={api} />);
    expect(findToggle(container, 'Include "Co-authored-by: Claude" trailer in commits')).toBeNull();
  });

  it("explains each attribution field behind an InfoTip", () => {
    const { api } = setup();
    const { container } = render(<GitSection data={makeConfigData()} api={api} />);
    expect(infoFor(container, "Commit attribution")).toMatch(/commits it writes/);
    expect(infoFor(container, "PR attribution")).toMatch(/pull requests it opens/);
  });

  it("offers to clear the legacy key only when it is set and suppressing output", () => {
    const { api, post } = setup();
    const data = makeConfigData();
    data.settings.includeCoAuthoredBySet = true;
    data.settings.includeCoAuthoredBy = false;
    const { getByText } = render(<GitSection data={data} api={api} />);
    fireEvent.click(getByText("Remove legacy key"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "includeCoAuthoredBy",
      value: "",
      scope: "global",
    });
  });

  it("stays quiet when the legacy key is absent or already true", () => {
    const { api } = setup();
    const absent = render(<GitSection data={makeConfigData()} api={api} />);
    expect(absent.queryByText("Remove legacy key")).toBeNull();
    absent.unmount();

    const on = makeConfigData();
    on.settings.includeCoAuthoredBySet = true;
    on.settings.includeCoAuthoredBy = true;
    const shown = render(<GitSection data={on} api={api} />);
    expect(shown.queryByText("Remove legacy key")).toBeNull();
  });

  describe("attribution has three reachable states", () => {
    // An absent key means "add Claude Code's default trailer"; a key set to
    // "" means "add nothing". A lone text box renders both as empty, and
    // clearing it used to delete the key.
    it("shows default when the key is absent, and no text box", () => {
      const { api } = setup();
      const { container } = render(<GitSection data={makeConfigData()} api={api} />);
      expect(triggerLabel(container, "PR attribution")).toBe("Claude Code default");
      expect(container.querySelector('input[aria-label="PR attribution text"]')).toBeNull();
    });

    it("shows 'Add nothing' for an explicit empty string", () => {
      const { api } = setup();
      const data = makeConfigData();
      data.settings.prAttributionSet = true;
      data.settings.prAttribution = "";
      const { container } = render(<GitSection data={data} api={api} />);
      expect(triggerLabel(container, "PR attribution")).toBe("Add nothing");
    });

    it("writes a literal empty string for 'Add nothing'", () => {
      const { api, post } = setup();
      const { container } = render(<GitSection data={makeConfigData()} api={api} />);
      choose(container, "PR attribution", "Add nothing");
      expect(post).toHaveBeenCalledWith({ type: "setPrAttribution", value: "" });
    });

    it("removes the key for 'Claude Code default'", () => {
      const { api, post } = setup();
      const { container } = render(<GitSection data={customAttribution()} api={api} />);
      choose(container, "PR attribution", "Claude Code default");
      expect(post).toHaveBeenCalledWith({
        type: "setSetting",
        key: "attribution.pr",
        value: "",
        scope: "global",
      });
    });
  });

  describe("custom text debounces the host write", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("coalesces a burst of keystrokes into a single host write", () => {
      const { api, post } = setup();
      const { container } = render(<GitSection data={customAttribution()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="Commit attribution text"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "C" } });
      fireEvent.input(field, { target: { value: "Co" } });
      fireEvent.input(field, { target: { value: "Co-" } });
      expect(post).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({ type: "setCommitAttribution", value: "Co-" });
    });

    it("flushes a pending write on unmount so a mid-pause edit is not lost", () => {
      const { api, post } = setup();
      const { container, unmount } = render(<GitSection data={customAttribution()} api={api} />);
      const field = container.querySelector(
        'input[aria-label="PR attribution text"]',
      ) as HTMLInputElement;
      fireEvent.input(field, { target: { value: "Generated" } });
      expect(post).not.toHaveBeenCalled();
      act(() => {
        unmount();
      });
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({ type: "setPrAttribution", value: "Generated" });
    });
  });
});
