// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { SnapshotsView } from "./SnapshotsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("SnapshotsView", () => {
  it("renders snapshot rows and fires restore/delete", () => {
    const { api, post } = setup();
    render(
      <SnapshotsView
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
    render(<SnapshotsView api={api} snapshots={[]} />);
    expect(screen.getByText(/No snapshots yet/)).toBeTruthy();
  });
});
