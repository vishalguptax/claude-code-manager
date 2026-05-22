// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../api";
import { SettingsView } from "../views/SettingsView";
import { PermissionsView } from "../views/PermissionsView";
import { SnapshotsView } from "../views/SnapshotsView";
import { BrainView } from "../views/BrainView";
import { makeConfigData } from "./fixtures";

function api(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("SettingsView", () => {
  it("posts setSetting for toggles, attribution, and retention", () => {
    const { api: a, post } = api();
    const data = makeConfigData({
      settings: { ...makeConfigData().settings, statusLineCommand: "echo hi" },
    });
    render(<SettingsView data={data} api={a} />);

    fireEvent.click(document.getElementById("cfg-coauthor") as HTMLInputElement);
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "includeCoAuthoredBy",
      value: true,
      scope: "global",
    });

    const cleanup = document.getElementById("cfg-cleanup") as HTMLInputElement;
    cleanup.value = "30";
    fireEvent.change(cleanup);
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "cleanupPeriodDays",
      value: 30,
      scope: "global",
    });

    // statusLineCommand renders as read-only code when present.
    expect(screen.getByText("echo hi")).toBeTruthy();
  });

  it("reset posts resetSettings and effort posts setSetting", () => {
    const { api: a, post } = api();
    render(<SettingsView data={makeConfigData()} api={a} />);
    fireEvent.click(document.getElementById("cfg-reset-settings") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({ type: "resetSettings", scope: "global" });

    const effort = document.getElementById("cfg-effort") as HTMLSelectElement;
    effort.value = "high";
    fireEvent.change(effort);
    expect(post).toHaveBeenCalledWith({ type: "setSetting", key: "effortLevel", value: "high", scope: "global" });
  });
});

describe("PermissionsView", () => {
  it("shows project/local scope tabs and fires onScopeChange", () => {
    const onScopeChange = vi.fn();
    const onSearchChange = vi.fn();
    const data = makeConfigData({
      permissions: [
        { scope: "global", allow: ["Read"], deny: [] },
        { scope: "project", allow: ["Bash(ls:*)"], deny: ["Bash(rm:*)"] },
      ],
      settings: { ...makeConfigData().settings, additionalDirectories: ["/tmp/extra"] },
    });
    const { api: a } = api();
    render(
      <PermissionsView
        data={data}
        api={a}
        scope="global"
        search=""
        onScopeChange={onScopeChange}
        onSearchChange={onSearchChange}
      />,
    );
    // Project + Local tabs present because a project scope exists.
    const projectTab = screen.getByText("Project");
    fireEvent.click(projectTab);
    expect(onScopeChange).toHaveBeenCalledWith("project");

    // Additional directory row + its remove button render.
    expect(screen.getByText("/tmp/extra")).toBeTruthy();
  });

  it("filters the allow list by the search query", () => {
    const data = makeConfigData({
      permissions: [{ scope: "global", allow: ["Read", "Write", "Bash(git:*)"], deny: [] }],
    });
    const { api: a } = api();
    render(
      <PermissionsView
        data={data}
        api={a}
        scope="global"
        search="git"
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Bash(git:*)")).toBeTruthy();
    expect(screen.queryByText("Write")).toBeNull();
  });
});

describe("SnapshotsView", () => {
  it("renders snapshot rows and fires restore/delete", () => {
    const { api: a, post } = api();
    render(
      <SnapshotsView
        api={a}
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
    const { api: a } = api();
    render(<SnapshotsView api={a} snapshots={[]} />);
    expect(screen.getByText(/No snapshots yet/)).toBeTruthy();
  });
});

describe("BrainView", () => {
  it("fires import + diagnostics commands", () => {
    const { api: a, post } = api();
    render(<BrainView api={a} />);
    fireEvent.click(document.getElementById("cfg-brain-import") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.importBrain" });
    fireEvent.click(document.getElementById("cfg-run-diagnostics") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.runDiagnostics" });
  });
});
