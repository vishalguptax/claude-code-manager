// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { CheckpointFile, CheckpointVersion } from "../../../types";
import {
  applyCheckpoints,
  applyError,
  applySessions,
  expandedPath,
  loadingFiles,
  resetCheckpointSignals,
  searchQuery,
  selectedSessionId,
} from "../../model";
import { CheckpointFiles } from "./CheckpointFiles";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const FILE_A = "/proj/src/platform.service.ts";
const FILE_B = "/proj/docs/README.md";

function version(overrides: Partial<CheckpointVersion> = {}): CheckpointVersion {
  const n = overrides.version ?? 1;
  return {
    version: n,
    backupFileName: `4edcabe38ffb6832@v${n}`,
    backupPath: `/h/${SESSION}/4edcabe38ffb6832@v${n}`,
    backupTime: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    available: true,
    sizeBytes: 2048,
    ...overrides,
  };
}

function file(overrides: Partial<CheckpointFile> = {}): CheckpointFile {
  const versions = overrides.versions ?? [version({ version: 1 }), version({ version: 2 })];
  return {
    path: FILE_A,
    name: "platform.service.ts",
    dir: "/proj/src",
    pathHash: "4edcabe38ffb6832",
    versions,
    latestVersion: Math.max(...versions.map((v) => v.version)),
    latestBackupTime: versions[versions.length - 1].backupTime,
    availableCount: versions.filter((v) => v.available).length,
    ...overrides,
  };
}

/** Render with a session selected and `files` populated. */
function renderFiles(
  files: CheckpointFile[],
  handlers: Partial<{
    onBack: () => void;
    onOpenFile: (p: string) => void;
    onDiff: (p: string, v: number) => void;
    onRestore: (p: string, v: number) => void;
  }> = {},
  orphans = 0,
) {
  applySessions([
    {
      sessionId: SESSION,
      label: "Rewrite the checkpoint parser",
      project: "claude-code-manager",
      fileCount: files.length,
      versionCount: files.reduce((n, f) => n + f.versions.length, 0),
      lastBackupMs: Date.now(),
      sizeBytes: 4096,
    },
  ]);
  selectedSessionId.value = SESSION;
  applyCheckpoints(SESSION, files, orphans);
  return render(
    h(CheckpointFiles, {
      onBack: vi.fn(),
      onOpenFile: vi.fn(),
      onDiff: vi.fn(),
      onRestore: vi.fn(),
      ...handlers,
    }),
  );
}

beforeEach(resetCheckpointSignals);

describe("CheckpointFiles — shell", () => {
  it("shows a skeleton while the file list is in flight", () => {
    selectedSessionId.value = SESSION;
    loadingFiles.value = true;
    render(
      h(CheckpointFiles, {
        onBack: vi.fn(),
        onOpenFile: vi.fn(),
        onDiff: vi.fn(),
        onRestore: vi.fn(),
      }),
    );
    expect(screen.queryByText("No tracked files for this session")).toBeNull();
  });

  it("names the session in the header and returns to the list", () => {
    const onBack = vi.fn();
    renderFiles([file()], { onBack });
    expect(screen.getByText("Rewrite the checkpoint parser")).toBeTruthy();
    fireEvent.click(screen.getByText("All sessions"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("explains an empty session whose transcript records no edits", () => {
    renderFiles([]);
    expect(screen.getByText("No tracked files for this session")).toBeTruthy();
    expect(
      screen.getByText("This session's transcript records no file edits."),
    ).toBeTruthy();
  });

  it("explains an empty session whose blobs outlived its transcript", () => {
    renderFiles([], {}, 7);
    expect(
      screen.getByText(
        "7 backup blobs are on disk, but the session transcript no longer records which files they belong to.",
      ),
    ).toBeTruthy();
  });

  it("surfaces a host error without blanking a populated list", async () => {
    renderFiles([file()]);
    applyError("Could not read the transcript");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Could not read the transcript",
      ),
    );
    expect(screen.getByText("platform.service.ts")).toBeTruthy();
  });
});

describe("CheckpointFiles — file list", () => {
  it("renders one file with its latest version and history summary", () => {
    renderFiles([file()]);
    expect(screen.getByText("platform.service.ts")).toBeTruthy();
    expect(screen.getByText("v2")).toBeTruthy();
    expect(screen.getByText("2 versions")).toBeTruthy();
    expect(screen.getByText("1 of 1 file")).toBeTruthy();
  });

  it("names how many versions were pruned", () => {
    renderFiles([
      file({
        versions: [
          version({ version: 1, available: false, sizeBytes: 0 }),
          version({ version: 2 }),
        ],
      }),
    ]);
    expect(screen.getByText("2 versions · 1 pruned")).toBeTruthy();
  });

  it("renders many files and counts them", () => {
    renderFiles([
      file(),
      file({ path: FILE_B, name: "README.md", dir: "/proj/docs" }),
    ]);
    expect(screen.getByText("2 of 2 files")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("shows the unmapped-blob count alongside a populated list", () => {
    renderFiles([file()], {}, 3);
    expect(screen.getByText("3 unmapped")).toBeTruthy();
  });

  it("exposes the full path on the file name for identification", () => {
    renderFiles([file()]);
    expect(screen.getByText("platform.service.ts").getAttribute("title")).toBe(FILE_A);
  });

  it("filters by the search query", async () => {
    renderFiles([
      file(),
      file({ path: FILE_B, name: "README.md", dir: "/proj/docs" }),
    ]);
    searchQuery.value = "readme";
    await waitFor(() => expect(screen.getByText("1 of 2 files")).toBeTruthy());
    expect(screen.queryByText("platform.service.ts")).toBeNull();
  });

  it("explains an empty filter result without losing the search box", async () => {
    renderFiles([file()]);
    searchQuery.value = "zzz";
    await waitFor(() =>
      expect(screen.getByText("No files match that filter")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Filter checkpoint files")).toBeTruthy();
  });
});

describe("CheckpointFiles — versions", () => {
  it("keeps the version list collapsed until the file row is clicked", () => {
    renderFiles([file()]);
    expect(screen.queryByText("Restore")).toBeNull();
    fireEvent.click(screen.getByText("platform.service.ts"));
    expect(screen.getAllByText("Restore")).toHaveLength(2);
  });

  it("lists versions newest first", () => {
    renderFiles([file({ versions: [version({ version: 1 }), version({ version: 7 })] })]);
    expect(expandedPath.value).toBeNull();
    fireEvent.click(screen.getByText("platform.service.ts"));
    const numbers = [...document.querySelectorAll(".ckpt-version-num")].map(
      (n) => n.textContent,
    );
    expect(numbers).toEqual(["v7", "v1"]);
  });

  it("collapses again on a second click", () => {
    renderFiles([file()]);
    fireEvent.click(screen.getByText("platform.service.ts"));
    fireEvent.click(screen.getByText("platform.service.ts"));
    expect(screen.queryByText("Restore")).toBeNull();
  });

  it("reports a diff request as (path, version)", () => {
    const onDiff = vi.fn();
    renderFiles([file()], { onDiff });
    fireEvent.click(screen.getByText("platform.service.ts"));
    // Newest first, so the first Diff button is v2.
    fireEvent.click(screen.getAllByText("Diff")[0]);
    expect(onDiff).toHaveBeenCalledWith(FILE_A, 2);
  });

  it("reports a restore request as (path, version)", () => {
    const onRestore = vi.fn();
    renderFiles([file()], { onRestore });
    fireEvent.click(screen.getByText("platform.service.ts"));
    fireEvent.click(screen.getAllByText("Restore")[1]);
    expect(onRestore).toHaveBeenCalledWith(FILE_A, 1);
  });

  it("opens the working file from the expanded panel", () => {
    const onOpenFile = vi.fn();
    renderFiles([file()], { onOpenFile });
    fireEvent.click(screen.getByText("platform.service.ts"));
    fireEvent.click(screen.getByText("Open current file"));
    expect(onOpenFile).toHaveBeenCalledWith(FILE_A);
  });

  it("offers no actions for a pruned version and says why", () => {
    renderFiles([
      file({
        versions: [
          version({ version: 1, available: false, sizeBytes: 0 }),
          version({ version: 2 }),
        ],
      }),
    ]);
    fireEvent.click(screen.getByText("platform.service.ts"));
    // One available version → exactly one Diff and one Restore.
    expect(screen.getAllByText("Diff")).toHaveLength(1);
    expect(screen.getAllByText("Restore")).toHaveLength(1);
    expect(screen.getByText("pruned")).toBeTruthy();
    expect(document.querySelectorAll(".ckpt-version--gone")).toHaveLength(1);
  });

  it("says 'unknown time' rather than rendering a broken date", () => {
    renderFiles([file({ versions: [version({ version: 1, backupTime: "" })] })]);
    fireEvent.click(screen.getByText("platform.service.ts"));
    expect(document.querySelector(".ckpt-version-meta")?.textContent).toContain(
      "unknown time",
    );
  });

  it("labels each action with the file and version it affects", () => {
    renderFiles([file({ versions: [version({ version: 1 })] })]);
    fireEvent.click(screen.getByText("platform.service.ts"));
    expect(screen.getByText("Restore").getAttribute("title")).toBe(
      "Overwrite platform.service.ts with v1",
    );
    expect(screen.getByText("Diff").getAttribute("title")).toBe(
      "Compare v1 with the current platform.service.ts",
    );
  });
});
