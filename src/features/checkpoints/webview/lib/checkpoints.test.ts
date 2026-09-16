import { describe, expect, it } from "vitest";
import type {
  CheckpointFile,
  CheckpointSessionSummary,
  CheckpointVersion,
} from "../../types";
import {
  backupTimeMs,
  describeFileHistory,
  filterCheckpointFiles,
  filterCheckpointSessions,
  newestFirst,
} from "./checkpoints";

function summary(
  overrides: Partial<CheckpointSessionSummary> = {},
): CheckpointSessionSummary {
  return {
    sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1",
    label: "Rewrite the checkpoint parser",
    project: "claude-code-manager",
    fileCount: 2,
    versionCount: 5,
    lastBackupMs: 1_757_617_333_560,
    sizeBytes: 4096,
    ...overrides,
  };
}

function version(overrides: Partial<CheckpointVersion> = {}): CheckpointVersion {
  return {
    version: 1,
    backupFileName: "aaaaaaaaaaaaaaaa@v1",
    backupPath: "/h/aaaaaaaaaaaaaaaa@v1",
    backupTime: "2026-09-11T19:02:13.560Z",
    available: true,
    sizeBytes: 100,
    ...overrides,
  };
}

function file(overrides: Partial<CheckpointFile> = {}): CheckpointFile {
  const versions = overrides.versions ?? [version()];
  return {
    path: "/proj/src/a.ts",
    name: "a.ts",
    dir: "/proj/src",
    pathHash: "aaaaaaaaaaaaaaaa",
    versions,
    latestVersion: versions[versions.length - 1]?.version ?? 0,
    latestBackupTime: "2026-09-11T19:02:13.560Z",
    availableCount: versions.filter((v) => v.available).length,
    ...overrides,
  };
}

describe("filterCheckpointFiles", () => {
  const files = [
    file({ path: "/proj/src/a.ts", name: "a.ts", dir: "/proj/src" }),
    file({ path: "/proj/docs/README.md", name: "README.md", dir: "/proj/docs" }),
  ];

  it("returns the same array reference for an empty query", () => {
    expect(filterCheckpointFiles(files, "")).toBe(files);
    expect(filterCheckpointFiles(files, "   ")).toBe(files);
  });

  it("matches on the file name, case-insensitively", () => {
    expect(filterCheckpointFiles(files, "README").map((f) => f.name)).toEqual([
      "README.md",
    ]);
    expect(filterCheckpointFiles(files, "readme").map((f) => f.name)).toEqual([
      "README.md",
    ]);
  });

  it("matches on the directory", () => {
    expect(filterCheckpointFiles(files, "docs").map((f) => f.name)).toEqual([
      "README.md",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCheckpointFiles(files, "zzz")).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(filterCheckpointFiles([], "a")).toEqual([]);
  });
});

describe("describeFileHistory", () => {
  it("uses the singular for one version", () => {
    expect(describeFileHistory(file({ versions: [version()] }))).toBe("1 version");
  });

  it("counts every version when all are present", () => {
    expect(
      describeFileHistory(
        file({ versions: [version({ version: 1 }), version({ version: 2 })] }),
      ),
    ).toBe("2 versions");
  });

  it("names how many versions were pruned", () => {
    expect(
      describeFileHistory(
        file({
          versions: [
            version({ version: 1, available: false }),
            version({ version: 2, available: false }),
            version({ version: 3 }),
          ],
        }),
      ),
    ).toBe("3 versions · 2 pruned");
  });
});

describe("newestFirst", () => {
  it("reverses the ascending version order", () => {
    const sorted = newestFirst([
      version({ version: 1 }),
      version({ version: 2 }),
      version({ version: 10 }),
    ]);
    expect(sorted.map((v) => v.version)).toEqual([10, 2, 1]);
  });

  it("does not mutate the input", () => {
    const input = [version({ version: 1 }), version({ version: 2 })];
    newestFirst(input);
    expect(input.map((v) => v.version)).toEqual([1, 2]);
  });

  it("handles an empty list", () => {
    expect(newestFirst([])).toEqual([]);
  });
});

describe("backupTimeMs", () => {
  it("parses an ISO timestamp", () => {
    expect(backupTimeMs(version({ backupTime: "2026-09-11T19:02:13.560Z" }))).toBe(
      Date.parse("2026-09-11T19:02:13.560Z"),
    );
  });

  it("returns 0 when the transcript carried no timestamp", () => {
    expect(backupTimeMs(version({ backupTime: "" }))).toBe(0);
  });

  it("returns 0 rather than NaN for an unparseable timestamp", () => {
    expect(backupTimeMs(version({ backupTime: "whenever" }))).toBe(0);
  });
});

describe("filterCheckpointSessions", () => {
  const sessions = [
    summary(),
    summary({
      sessionId: "0bc64250-c3a3-4936-a32e-2a261f3f49a0",
      label: "Fix the hook parser",
      project: "api",
    }),
  ];

  it("returns the same array reference for an empty query", () => {
    expect(filterCheckpointSessions(sessions, "")).toBe(sessions);
    expect(filterCheckpointSessions(sessions, "   ")).toBe(sessions);
  });

  it("matches on the label, case-insensitively", () => {
    expect(filterCheckpointSessions(sessions, "HOOK").map((s) => s.label)).toEqual([
      "Fix the hook parser",
    ]);
  });

  it("matches on the project", () => {
    expect(
      filterCheckpointSessions(sessions, "claude-code").map((s) => s.label),
    ).toEqual(["Rewrite the checkpoint parser"]);
  });

  it("matches on the session id, which is what names the history directory", () => {
    expect(filterCheckpointSessions(sessions, "0bc64250").map((s) => s.label)).toEqual([
      "Fix the hook parser",
    ]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterCheckpointSessions(sessions, "zzz")).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(filterCheckpointSessions([], "a")).toEqual([]);
  });
});
