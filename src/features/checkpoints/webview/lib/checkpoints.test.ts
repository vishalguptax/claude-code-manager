import { describe, expect, it } from "vitest";
import type { CheckpointFile, CheckpointVersion } from "../../types";
import {
  backupTimeMs,
  describeFileHistory,
  filterCheckpointFiles,
  newestFirst,
  shortenDir,
} from "./checkpoints";

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

describe("shortenDir", () => {
  it("strips the workspace prefix", () => {
    expect(shortenDir("/proj/src/api", "/proj")).toBe("src/api");
  });

  it("renders the workspace root itself as a dot", () => {
    expect(shortenDir("/proj", "/proj")).toBe(".");
  });

  it("leaves a directory outside the workspace alone", () => {
    expect(shortenDir("/other/src", "/proj")).toBe("/other/src");
  });

  it("leaves the directory alone when there is no workspace", () => {
    expect(shortenDir("/proj/src")).toBe("/proj/src");
  });
});
