import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";

const { HOME } = vi.hoisted(() => {
  const _path = require("path") as typeof import("path");
  const _os = require("os") as typeof import("os");
  return { HOME: _path.join(_os.tmpdir(), ".claude-test-agents-access") };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return { ...actual, homedir: () => HOME };
});

import { findAgent, findEditableAgent } from "../access";

const AGENTS = path.join(HOME, ".claude", "agents");
const WS = path.join(HOME, "repo");
const OUTSIDE = path.join(HOME, "outside");

function writeAgent(file: string, name: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\nname: ${name}\ndescription: d\n---\nbody`);
}

beforeEach(() => {
  fs.rmSync(HOME, { recursive: true, force: true });
  fs.mkdirSync(WS, { recursive: true });
});
afterEach(() => fs.rmSync(HOME, { recursive: true, force: true }));

describe("findEditableAgent", () => {
  it("resolves global and project agents the host parsed", () => {
    writeAgent(path.join(AGENTS, "reviewer.md"), "reviewer");
    writeAgent(path.join(WS, ".claude", "agents", "deployer.md"), "deployer");
    expect(findEditableAgent(path.join(AGENTS, "reviewer.md"), WS).ok).toBe(true);
    expect(findEditableAgent(path.join(WS, ".claude", "agents", "deployer.md"), WS).ok).toBe(true);
  });

  it("refuses paths that are not parsed agents, including traversal", () => {
    writeAgent(path.join(AGENTS, "reviewer.md"), "reviewer");
    writeAgent(path.join(OUTSIDE, "victim.md"), "victim");
    expect(findEditableAgent(path.join(OUTSIDE, "victim.md")).ok).toBe(false);
    expect(findEditableAgent(path.join(AGENTS, "..", "..", "outside", "victim.md")).ok).toBe(false);
    expect(findAgent("/etc/passwd").ok).toBe(false);
  });

  it("refuses a plugin's agent", () => {
    const root = path.join(HOME, ".claude", "plugins", "cache", "mkt", "p", "1.0.0");
    writeAgent(path.join(root, "agents", "helper.md"), "helper");
    fs.writeFileSync(
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "p@mkt": [{ scope: "user", installPath: root }] } }),
    );
    const p = path.join(root, "agents", "helper.md");
    expect(findAgent(p).ok).toBe(true);
    expect(findEditableAgent(p)).toMatchObject({ ok: false });
  });

  it("follows a symlinked agents dir itself — a dotfiles-managed root is still the root", () => {
    // The root is resolved too, so a linked ~/.claude/agents stays editable;
    // what cannot pass is a path that leaves whatever the root resolves to.
    writeAgent(path.join(OUTSIDE, "agents", "reviewer.md"), "reviewer");
    fs.mkdirSync(path.join(HOME, ".claude"), { recursive: true });
    fs.symlinkSync(path.join(OUTSIDE, "agents"), AGENTS);
    expect(findEditableAgent(path.join(AGENTS, "reviewer.md")).ok).toBe(true);
    expect(findEditableAgent(path.join(AGENTS, "..", "..", "outside", "agents", "reviewer.md")).ok).toBe(
      false,
    );
  });
});
