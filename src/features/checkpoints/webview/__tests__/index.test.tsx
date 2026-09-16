// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { CheckpointFile, CheckpointSessionSummary } from "../../types";
import { resetCheckpointSignals } from "../model";
import CheckpointsTab from "../index";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const FILE = "/proj/src/platform.service.ts";

function summary(
  overrides: Partial<CheckpointSessionSummary> = {},
): CheckpointSessionSummary {
  return {
    sessionId: SESSION,
    label: "Rewrite the checkpoint parser",
    project: "claude-code-manager",
    fileCount: 1,
    versionCount: 2,
    lastBackupMs: Date.now() - 60_000,
    sizeBytes: 2048,
    ...overrides,
  };
}

function file(): CheckpointFile {
  return {
    path: FILE,
    name: "platform.service.ts",
    dir: "/proj/src",
    pathHash: "4edcabe38ffb6832",
    versions: [
      {
        version: 1,
        backupFileName: "4edcabe38ffb6832@v1",
        backupPath: `/h/${SESSION}/4edcabe38ffb6832@v1`,
        backupTime: new Date(Date.now() - 3_600_000).toISOString(),
        available: true,
        sizeBytes: 1024,
      },
    ],
    latestVersion: 1,
    latestBackupTime: new Date(Date.now() - 3_600_000).toISOString(),
    availableCount: 1,
  };
}

let posted: unknown[] = [];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  _resetMessageBus();
  resetCheckpointSignals();
});

afterEach(() => {
  setVscodeApi(null);
  _resetMessageBus();
  resetCheckpointSignals();
});

describe("CheckpointsTab", () => {
  it("requests the session list on mount", () => {
    render(h(CheckpointsTab, {}));
    expect(posted).toContainEqual({ type: "getCheckpointSessions" });
  });

  it("renders sessions received over the message bus", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() =>
      expect(screen.getByText("Rewrite the checkpoint parser")).toBeTruthy(),
    );
  });

  it("tolerates a session payload that is not an array", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [] });
    await waitFor(() => expect(screen.getByText("No file checkpoints yet")).toBeTruthy());
  });

  it("asks for a session's checkpoints when one is selected", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() => screen.getByText("Rewrite the checkpoint parser"));
    fireEvent.click(screen.getByText("Rewrite the checkpoint parser"));
    expect(posted).toContainEqual({ type: "getCheckpoints", sessionId: SESSION });
  });

  it("renders the selected session's files and navigates back", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() => screen.getByText("Rewrite the checkpoint parser"));
    fireEvent.click(screen.getByText("Rewrite the checkpoint parser"));
    dispatch({
      type: "checkpoints",
      sessionId: SESSION,
      data: [file()],
      orphanCount: 0,
    });

    await waitFor(() => expect(screen.getByText("platform.service.ts")).toBeTruthy());
    fireEvent.click(screen.getByText("All sessions"));
    await waitFor(() =>
      expect(screen.getByText("1 session with checkpoints")).toBeTruthy(),
    );
  });

  it("posts a diff request naming the file and version, not a blob", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() => screen.getByText("Rewrite the checkpoint parser"));
    fireEvent.click(screen.getByText("Rewrite the checkpoint parser"));
    dispatch({ type: "checkpoints", sessionId: SESSION, data: [file()], orphanCount: 0 });
    await waitFor(() => screen.getByText("platform.service.ts"));

    fireEvent.click(screen.getByText("platform.service.ts"));
    fireEvent.click(screen.getByText("Diff"));
    expect(posted).toContainEqual({
      type: "diffCheckpoint",
      sessionId: SESSION,
      filePath: FILE,
      version: 1,
    });
  });

  it("posts a restore request and lets the host own the confirmation", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() => screen.getByText("Rewrite the checkpoint parser"));
    fireEvent.click(screen.getByText("Rewrite the checkpoint parser"));
    dispatch({ type: "checkpoints", sessionId: SESSION, data: [file()], orphanCount: 0 });
    await waitFor(() => screen.getByText("platform.service.ts"));

    fireEvent.click(screen.getByText("platform.service.ts"));
    fireEvent.click(screen.getByText("Restore"));
    expect(posted).toContainEqual({
      type: "restoreCheckpoint",
      sessionId: SESSION,
      filePath: FILE,
      version: 1,
    });
  });

  it("surfaces a host error message", async () => {
    render(h(CheckpointsTab, {}));
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() => screen.getByText("Rewrite the checkpoint parser"));
    dispatch({ type: "error", message: "Could not read ~/.claude/file-history" });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not read ~/.claude/file-history",
      ),
    );
  });

  it("stops listening once unmounted", async () => {
    const { unmount } = render(h(CheckpointsTab, {}));
    unmount();
    // A late host push must not re-populate signals for a torn-down tab.
    dispatch({ type: "checkpointSessions", data: [summary()] });
    await waitFor(() =>
      expect(screen.queryByText("Rewrite the checkpoint parser")).toBeNull(),
    );
  });
});
