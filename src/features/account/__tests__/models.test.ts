import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// All filesystem layouts used by these tests are built under a single
// temp dir so we never touch the user's real ~/.claude or npm global.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-models-"));

// Mutable references the mocks below close over. beforeEach() resets
// them so each test fully controls homedir, npm root, and PATH lookup.
const ctx = {
  home: tmpRoot,
  execImpl: ((_cmd: string) => {
    throw new Error("not configured");
  }) as (cmd: string) => string,
};

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => ctx.home };
});

vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  // Callback-style `exec` so `promisify(exec)` in models.ts resolves/rejects
  // exactly as the real child_process would. `ctx.execImpl` throwing models a
  // failed spawn (npm missing / not on PATH).
  return {
    ...actual,
    exec: (cmd: string, _opts: unknown, cb: (e: unknown, r?: { stdout: string }) => void) => {
      try {
        cb(null, { stdout: ctx.execImpl(cmd) });
      } catch (err) {
        cb(err);
      }
    },
  };
});

import {
  discoverModelsFromCli,
  warmModelCache,
  clearModelCache,
  revalidateModelCache,
} from "../models";

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/**
 * Write a fake CLI binary containing the given model ID strings. The
 * scanner reads as latin1, so a plain ASCII text file is a faithful
 * stand-in for the real native binary's embedded strings.
 */
function writeFakeBinary(filePath: string, modelIds: string[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Surround each ID with non-word bytes so the scanner's `\b` matches
  // — mirrors how IDs sit between null terminators or quotes in the
  // real binary. (Underscore is a word char and would block \b.)
  const content = modelIds.map((id) => ` ${id} `).join("\n");
  fs.writeFileSync(filePath, content, "latin1");
}

function nodeModulesLayout(root: string): string {
  return path.join(root, "node_modules");
}

function pkgRootBinary(nodeModules: string, platform: string): string {
  return path.join(
    nodeModules,
    "@anthropic-ai",
    "claude-code",
    "node_modules",
    "@anthropic-ai",
    `claude-code-${platform}`,
    process.platform === "win32" ? "claude.exe" : "claude",
  );
}

beforeEach(() => {
  clearModelCache();
  // Default: HOME points at an empty dir so the native-installer path
  // does not exist unless a test opts in.
  ctx.home = fs.mkdtempSync(path.join(tmpRoot, "home-"));
  // Default: npm root -g and PATH lookup both fail so the test only
  // sees what it explicitly configured.
  ctx.execImpl = () => {
    throw new Error("not configured");
  };
});

describe("discoverModelsFromCli", () => {
  it("returns empty array when no CLI install is found anywhere", async () => {
    expect(await warmModelCache()).toEqual([]);
  });

  it("sync discoverModelsFromCli returns empty on a cold cache and never blocks", () => {
    // Cold: the scan hasn't run, so the sync reader must return [] immediately
    // rather than spawning on the caller's thread.
    expect(discoverModelsFromCli()).toEqual([]);
  });

  it("scans the native-installer layout under ~/.claude/local", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "native-home-"));
    ctx.home = home;

    const localNodeModules = nodeModulesLayout(path.join(home, ".claude", "local"));
    const binary = pkgRootBinary(localNodeModules, "linux-x64");
    writeFakeBinary(binary, ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"]);

    const models = await warmModelCache();
    const ids = models.map((m) => m.id);
    expect(ids).toContain("claude-opus-4-7");
    expect(ids).toContain("claude-sonnet-4-6");
    expect(ids).toContain("claude-haiku-4-5");
  });

  it("discovers new model families (fable) without a hardcoded list", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "fable-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-fable-5", "claude-mythos-5", "claude-opus-4-8"]);

    const models = await warmModelCache();
    const fable = models.find((m) => m.family === "fable");
    expect(fable).toMatchObject({
      id: "claude-fable-5",
      alias: "fable",
      label: "Fable 5",
      isLatest: true,
    });
    expect(models.map((m) => m.family)).toContain("mythos");
    // Fable 5 (versionNum 5000) sorts above Opus 4.8 (4008).
    expect(models[0].family).toBe("fable");
  });

  it("re-scans when the CLI binary changed (upgrade adds a new family)", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "reval-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-opus-4-8"]);
    expect((await warmModelCache()).map((m) => m.family)).toEqual(["opus"]);

    // Nothing changed — revalidate is a no-op.
    expect(await revalidateModelCache()).toBe(false);

    // "Upgrade" the CLI in place: new content (different size) with a
    // new model family embedded.
    writeFakeBinary(binary, ["claude-opus-4-8", "claude-fable-5"]);
    expect(await revalidateModelCache()).toBe(true);
    expect(discoverModelsFromCli().map((m) => m.family).sort()).toEqual([
      "fable",
      "opus",
    ]);
  });

  it("filters non-model lookalikes like claude-code-2 and claude-instant-1", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "lookalike-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-code-2", "claude-instant-1", "claude-opus-4-8"]);

    const families = (await warmModelCache()).map((m) => m.family);
    expect(families).toEqual(["opus"]);
  });

  it("falls back to npm global root when ~/.claude/local is missing", async () => {
    const npmRoot = fs.mkdtempSync(path.join(tmpRoot, "npm-root-"));
    ctx.execImpl = (cmd: string) => {
      if (cmd.includes("npm root")) return `${npmRoot}\n`;
      throw new Error("not configured");
    };

    const binary = pkgRootBinary(npmRoot, "darwin-arm64");
    writeFakeBinary(binary, ["claude-opus-4-7", "claude-sonnet-4-6"]);

    const models = await warmModelCache();
    expect(models.map((m) => m.id).sort()).toEqual(
      ["claude-opus-4-7", "claude-sonnet-4-6"].sort(),
    );
  });

  it("merges results across native-install + npm + PATH candidates", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "merge-home-"));
    ctx.home = home;

    // Native installer has only Opus.
    const localBin = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(localBin, ["claude-opus-4-7"]);

    // npm global has only Sonnet.
    const npmRoot = fs.mkdtempSync(path.join(tmpRoot, "npm-merge-"));
    const npmBin = pkgRootBinary(npmRoot, "darwin-arm64");
    writeFakeBinary(npmBin, ["claude-sonnet-4-6"]);

    // PATH lookup finds a third binary that has Haiku.
    const pathBin = path.join(tmpRoot, "path-bin", "claude");
    writeFakeBinary(pathBin, ["claude-haiku-4-5"]);

    ctx.execImpl = (cmd: string) => {
      if (cmd.includes("npm root")) return `${npmRoot}\n`;
      if (cmd.includes("where claude") || cmd.includes("command -v claude")) {
        return `${pathBin}\n`;
      }
      throw new Error("not configured");
    };

    const families = (await warmModelCache()).map((m) => m.family).sort();
    expect(families).toEqual(["haiku", "opus", "sonnet"]);
  });

  it("marks the newest of each family as isLatest and sorts newest first", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "latest-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, [
      "claude-opus-4-5",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
    ]);

    const models = await warmModelCache();
    // Sorted newest first.
    expect(models[0].id).toBe("claude-opus-4-7");
    // Only the newest opus is marked latest; older opus versions are not.
    const opusLatest = models.filter((m) => m.family === "opus" && m.isLatest);
    expect(opusLatest).toHaveLength(1);
    expect(opusLatest[0].id).toBe("claude-opus-4-7");
    // Sonnet only has one version — that one is latest.
    expect(models.find((m) => m.family === "sonnet")?.isLatest).toBe(true);
  });

  it("ignores date-versioned snapshots like claude-opus-4-20250514", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "date-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-opus-4-20250514", "claude-opus-4-7"]);

    const ids = (await warmModelCache()).map((m) => m.id);
    expect(ids).toContain("claude-opus-4-7");
    expect(ids).not.toContain("claude-opus-4-20250514");
  });

  it("dedupes claude-opus-4 against claude-opus-4-0", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "dedupe-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-opus-4", "claude-opus-4-0"]);

    const opus = (await warmModelCache()).filter((m) => m.family === "opus");
    expect(opus).toHaveLength(1);
  });

  it("caches results so the sync reader returns them without re-scanning", async () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "cache-home-"));
    ctx.home = home;

    const binary = pkgRootBinary(
      nodeModulesLayout(path.join(home, ".claude", "local")),
      "linux-x64",
    );
    writeFakeBinary(binary, ["claude-opus-4-7"]);

    const first = await warmModelCache();
    // Delete the source file — the sync reader must still return cached data.
    fs.rmSync(binary);
    const second = discoverModelsFromCli();
    expect(second).toEqual(first);
  });
});
