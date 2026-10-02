import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const which = vi.hoisted(() => ({ out: "" as string | Error, calls: 0 }));
vi.mock("child_process", () => ({
  execFileSync: (): string => {
    which.calls++;
    if (which.out instanceof Error) throw which.out;
    return which.out;
  },
}));

const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "csm-node-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

/** Fresh module per test — resolveNodePath memoises per extension host. */
async function load(): Promise<typeof import("../nodePath")> {
  vi.resetModules();
  return import("../nodePath");
}

function executable(p: string): string {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "#!/bin/sh\n");
  fs.chmodSync(p, 0o755);
  return p;
}

beforeEach(() => {
  which.out = "";
  which.calls = 0;
});

describe("resolveNodePath", () => {
  it("returns the first path `which` prints, and memoises it", async () => {
    which.out = "/usr/local/bin/node\n/usr/bin/node\n";
    const { resolveNodePath } = await load();
    expect(resolveNodePath()).toBe("/usr/local/bin/node");
    expect(resolveNodePath()).toBe("/usr/local/bin/node");
    expect(which.calls).toBe(1);
  });

  it("falls back to bare node when detection fails", async () => {
    which.out = new Error("not found");
    const { resolveNodePath } = await load();
    expect(resolveNodePath()).toBe("node");
  });

  it.skipIf(process.platform === "win32")(
    "resolves fnm's per-shell multishell link to the versioned binary",
    async () => {
      const real = executable(path.join(root, "fnm", "node-versions", "v22.1.0", "bin", "node"));
      const shell = path.join(root, "fnm_multishells", "4242_1700000000", "bin");
      fs.mkdirSync(shell, { recursive: true });
      fs.symlinkSync(real, path.join(shell, "node"));
      which.out = `${path.join(shell, "node")}\n`;
      const { resolveNodePath } = await load();
      expect(resolveNodePath()).toBe(real);
    },
  );

  it.skipIf(process.platform === "win32")(
    "keeps other links as found (Homebrew's stable bin link, Volta shims)",
    async () => {
      const cellar = executable(path.join(root, "Cellar", "node", "22.1.0", "bin", "node"));
      const bin = path.join(root, "homebrew", "bin");
      fs.mkdirSync(bin, { recursive: true });
      fs.symlinkSync(cellar, path.join(bin, "node"));
      which.out = `${path.join(bin, "node")}\n`;
      const { resolveNodePath } = await load();
      expect(resolveNodePath()).toBe(path.join(bin, "node"));
    },
  );
});

describe("commandNodeUsable", () => {
  it("trusts a bare or PATH node while no absolute node can be detected", async () => {
    which.out = new Error("not found");
    const { commandNodeUsable } = await load();
    expect(commandNodeUsable('"node" "/x/tap.js"')).toBe(true);
    expect(commandNodeUsable("node /x/tap.js")).toBe(true);
  });

  it("reports a bare node unusable once detection finds an absolute one", async () => {
    // Installed while node was off VS Code's PATH; now it can be baked.
    which.out = "/usr/local/bin/node\n";
    const { commandNodeUsable } = await load();
    expect(commandNodeUsable('"node" "/x/tap.js"')).toBe(false);
    expect(commandNodeUsable("node /x/tap.js")).toBe(false);
  });

  it("is true for an existing executable, false once it is gone", async () => {
    const { commandNodeUsable } = await load();
    const node = executable(path.join(root, "usable", "node"));
    expect(commandNodeUsable(`"${node}" "/x/tap.js"`)).toBe(true);
    fs.rmSync(node);
    expect(commandNodeUsable(`"${node}" "/x/tap.js"`)).toBe(false);
  });

  it.skipIf(process.platform === "win32")("is false for a non-executable file", async () => {
    const { commandNodeUsable } = await load();
    const node = path.join(root, "noexec", "node");
    fs.mkdirSync(path.dirname(node), { recursive: true });
    fs.writeFileSync(node, "");
    fs.chmodSync(node, 0o644);
    expect(commandNodeUsable(`"${node}" "/x/tap.js"`)).toBe(false);
  });
});
