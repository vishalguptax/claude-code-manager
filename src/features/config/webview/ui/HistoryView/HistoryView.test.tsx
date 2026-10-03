// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetSections, toggleSection } from "../../../../../webview/shared/model";
import { createConfigApi } from "../../api";
import { HistoryView } from "./HistoryView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("HistoryView", () => {
  beforeEach(() => {
    _resetSections();
    // The section starts folded; open it so its body is there to test.
    toggleSection("config:history");
  });

  it("renders snapshot rows and fires restore/delete", () => {
    const { api, post } = setup();
    render(
      <HistoryView
        api={api}
        snapshots={[
          {
            id: "snap-1",
            takenAtMs: Date.now(),
            scope: "global",
            changedKeys: ["model", "effortLevel", "voiceEnabled", "spinnerTipsEnabled"],
            sizeBytes: 2048,
          },
        ]}
      />,
    );
    fireEvent.click(document.querySelector(".cfg-snap-restore") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({
      type: "restoreSettingsSnapshot",
      scope: "global",
      snapshotId: "snap-1",
    });
    fireEvent.click(document.querySelector(".cfg-snap-delete") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({
      type: "deleteSettingsSnapshot",
      scope: "global",
      snapshotId: "snap-1",
    });
  });

  it("renders the empty state with no snapshots", () => {
    const { api } = setup();
    render(<HistoryView api={api} snapshots={[]} />);
    expect(screen.getByText(/saved here each time you change one/)).toBeTruthy();
  });

  it("wraps the rows in the .cfg-snap-list scroll container (inner scroll target)", () => {
    // The list grows with history (up to 20 per scope); its `.cfg-snap-list`
    // container carries the max-height + overflow-y:auto so it scrolls
    // internally instead of stretching the Config page. Pin the container so a
    // refactor that drops the class doesn't silently remove the scroll cap.
    const { api } = setup();
    const { container } = render(
      <HistoryView
        api={api}
        snapshots={Array.from({ length: 5 }, (_, i) => ({
          id: `snap-${i}`,
          takenAtMs: Date.now() - i * 1000,
          scope: "global" as const,
          changedKeys: ["model"],
          sizeBytes: 1024,
        }))}
      />,
    );
    const list = container.querySelector(".cfg-snap-list");
    expect(list).toBeTruthy();
    expect(list?.querySelectorAll(".cfg-snap-row").length).toBe(5);
  });

  // The last-resort recovery sits with the other ways back, not among the
  // everyday shortcuts.
  it("offers Reset with the history, as a danger action", () => {
    const { api, post } = setup();
    render(<HistoryView api={api} snapshots={[]} />);
    const reset = screen.getByText("Reset settings.json").closest("button") as HTMLButtonElement;
    expect(reset.classList.contains("btn-danger")).toBe(true);
    fireEvent.click(reset);
    expect(post).toHaveBeenCalledWith({ type: "resetSettings", scope: "global" });
  });
});
