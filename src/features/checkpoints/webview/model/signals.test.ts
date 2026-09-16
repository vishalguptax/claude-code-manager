import { beforeEach, describe, expect, it } from "vitest";
import type { CheckpointFile, CheckpointSessionSummary } from "../../types";
import {
  applyCheckpoints,
  applyError,
  applySessions,
  errorMessage,
  filteredFiles,
  files,
  loadingFiles,
  loadingSessions,
  orphanCount,
  resetCheckpointSignals,
  searchQuery,
  selectedSession,
  selectedSessionId,
  sessions,
} from "./signals";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const OTHER = "0bc64250-c3a3-4936-a32e-2a261f3f49a0";

function summary(
  overrides: Partial<CheckpointSessionSummary> = {},
): CheckpointSessionSummary {
  return {
    sessionId: SESSION,
    label: "09285b5a",
    project: "claude-code-manager",
    fileCount: 2,
    versionCount: 5,
    lastBackupMs: 1_757_616_133_560,
    sizeBytes: 4096,
    ...overrides,
  };
}

function file(overrides: Partial<CheckpointFile> = {}): CheckpointFile {
  return {
    path: "/proj/src/a.ts",
    name: "a.ts",
    dir: "/proj/src",
    pathHash: "aaaaaaaaaaaaaaaa",
    versions: [],
    latestVersion: 1,
    latestBackupTime: "2026-09-11T19:02:13.560Z",
    availableCount: 0,
    ...overrides,
  };
}

// Module-level signals persist between tests in this file, so reset each time.
beforeEach(resetCheckpointSignals);

describe("initial state", () => {
  it("starts empty and loading", () => {
    expect(sessions.value).toEqual([]);
    expect(files.value).toEqual([]);
    expect(loadingSessions.value).toBe(true);
    expect(loadingFiles.value).toBe(false);
    expect(selectedSessionId.value).toBeNull();
    expect(errorMessage.value).toBeNull();
  });
});

describe("applySessions", () => {
  it("replaces the list and clears loading", () => {
    applySessions([summary()]);
    expect(sessions.value).toHaveLength(1);
    expect(loadingSessions.value).toBe(false);
  });

  it("clears a previous error", () => {
    applyError("boom");
    applySessions([]);
    expect(errorMessage.value).toBeNull();
  });

  it("accepts an empty list", () => {
    applySessions([]);
    expect(sessions.value).toEqual([]);
    expect(loadingSessions.value).toBe(false);
  });
});

describe("selectedSession", () => {
  it("is null while no session is selected", () => {
    applySessions([summary()]);
    expect(selectedSession.value).toBeNull();
  });

  it("resolves the selected id to its summary", () => {
    applySessions([summary(), summary({ sessionId: OTHER, label: "0bc64250" })]);
    selectedSessionId.value = OTHER;
    expect(selectedSession.value?.label).toBe("0bc64250");
  });

  it("is null when the selected id is not in the list", () => {
    applySessions([summary()]);
    selectedSessionId.value = OTHER;
    expect(selectedSession.value).toBeNull();
  });
});

describe("applyCheckpoints", () => {
  it("stores the files for the selected session", () => {
    selectedSessionId.value = SESSION;
    applyCheckpoints(SESSION, [file()], 3);
    expect(files.value).toHaveLength(1);
    expect(orphanCount.value).toBe(3);
    expect(loadingFiles.value).toBe(false);
  });

  it("ignores a reply for a session the user has navigated away from", () => {
    // The user selected a second session while the first reply was in flight.
    selectedSessionId.value = OTHER;
    applyCheckpoints(SESSION, [file()], 3);
    expect(files.value).toEqual([]);
    expect(orphanCount.value).toBe(0);
  });

  it("ignores a reply once the user is back on the session list", () => {
    selectedSessionId.value = null;
    applyCheckpoints(SESSION, [file()], 1);
    expect(files.value).toEqual([]);
  });
});

describe("filteredFiles", () => {
  beforeEach(() => {
    selectedSessionId.value = SESSION;
    applyCheckpoints(
      SESSION,
      [
        file({ path: "/proj/src/a.ts", name: "a.ts", dir: "/proj/src" }),
        file({ path: "/proj/docs/README.md", name: "README.md", dir: "/proj/docs" }),
      ],
      0,
    );
  });

  it("passes everything through with no query", () => {
    expect(filteredFiles.value).toHaveLength(2);
  });

  it("narrows to matching files", () => {
    searchQuery.value = "readme";
    expect(filteredFiles.value.map((f) => f.name)).toEqual(["README.md"]);
  });

  it("recomputes when the file list changes", () => {
    searchQuery.value = "a.ts";
    expect(filteredFiles.value).toHaveLength(1);
    applyCheckpoints(SESSION, [], 0);
    expect(filteredFiles.value).toEqual([]);
  });
});

describe("applyError", () => {
  it("records the message and stops both loading states", () => {
    loadingFiles.value = true;
    applyError("could not read the history directory");
    expect(errorMessage.value).toBe("could not read the history directory");
    expect(loadingSessions.value).toBe(false);
    expect(loadingFiles.value).toBe(false);
  });
});

describe("resetCheckpointSignals", () => {
  it("returns every signal to its initial value", () => {
    applySessions([summary()]);
    selectedSessionId.value = SESSION;
    applyCheckpoints(SESSION, [file()], 2);
    searchQuery.value = "x";
    applyError("boom");

    resetCheckpointSignals();

    expect(sessions.value).toEqual([]);
    expect(files.value).toEqual([]);
    expect(orphanCount.value).toBe(0);
    expect(selectedSessionId.value).toBeNull();
    expect(searchQuery.value).toBe("");
    expect(errorMessage.value).toBeNull();
    expect(loadingSessions.value).toBe(true);
    expect(loadingFiles.value).toBe(false);
  });
});
