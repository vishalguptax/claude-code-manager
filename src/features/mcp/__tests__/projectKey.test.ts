import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { claudeCwd, claudeProjectKey } from "../projectKey";

/**
 * Fixtures lay out `.git` exactly as git writes it (`git init`, `git worktree
 * add`, a submodule), with the realpath'd absolute paths git records. Claude
 * Code 2.1.287 was checked against the same layouts: from a repo subfolder and
 * from a linked worktree it read and wrote the main checkout's entry, and a
 * folder outside any repo got its own realpath'd entry.
 */
let root: string;

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-project-key-")));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A main checkout plus one linked worktree, as `git worktree add` leaves them. */
function repoWithWorktree(): { main: string; wt: string } {
  const main = path.join(root, "main");
  const wt = path.join(root, "wt");
  const admin = path.join(main, ".git", "worktrees", "wt");
  fs.mkdirSync(path.join(main, ".git"), { recursive: true });
  write(path.join(admin, "commondir"), "../..\n");
  write(path.join(admin, "gitdir"), `${path.join(wt, ".git")}\n`);
  write(path.join(wt, ".git"), `gitdir: ${admin}\n`);
  return { main, wt };
}

describe("claudeCwd", () => {
  it("is the realpath of the folder, NFC-normalised", () => {
    const dir = path.join(root, "cafe\u0301");
    fs.mkdirSync(dir);
    const link = path.join(root, "link");
    fs.symlinkSync(dir, link);
    expect(claudeCwd(link)).toBe(path.join(root, "caf\u00e9"));
  });
});

describe("claudeProjectKey", () => {
  it("keys a folder outside any repo by its realpath", () => {
    const dir = path.join(root, "plain");
    fs.mkdirSync(dir);
    const link = path.join(root, "plain-link");
    fs.symlinkSync(dir, link);
    expect(claudeProjectKey(dir)).toBe(dir);
    expect(claudeProjectKey(link)).toBe(dir);
  });

  it("keys a subfolder of a repo by the repo root", () => {
    const repo = path.join(root, "repo");
    fs.mkdirSync(path.join(repo, ".git"), { recursive: true });
    fs.mkdirSync(path.join(repo, "packages", "app"), { recursive: true });
    expect(claudeProjectKey(path.join(repo, "packages", "app"))).toBe(repo);
    expect(claudeProjectKey(repo)).toBe(repo);
  });

  it("keys a linked worktree, and folders inside it, by the main checkout", () => {
    const { main, wt } = repoWithWorktree();
    fs.mkdirSync(path.join(wt, "src"));
    expect(claudeProjectKey(wt)).toBe(main);
    expect(claudeProjectKey(path.join(wt, "src"))).toBe(main);
  });

  it("keeps a worktree on its own key when its back-link names another checkout", () => {
    const { wt } = repoWithWorktree();
    write(path.join(root, "main", ".git", "worktrees", "wt", "gitdir"), "/somewhere/else/.git\n");
    expect(claudeProjectKey(wt)).toBe(wt);
  });

  it("keeps a submodule on its own key (its gitdir is not a worktree admin dir)", () => {
    const sup = path.join(root, "super");
    const sub = path.join(sup, "lib");
    const modules = path.join(sup, ".git", "modules", "lib");
    fs.mkdirSync(modules, { recursive: true });
    write(path.join(sub, ".git"), `gitdir: ${modules}\n`);
    expect(claudeProjectKey(sub)).toBe(sub);
  });

  it("keys a worktree of a bare repository by the bare repository itself", () => {
    const bare = path.join(root, "proj.git");
    const wt = path.join(root, "proj-wt");
    const admin = path.join(bare, "worktrees", "proj-wt");
    write(path.join(admin, "commondir"), "../..\n");
    write(path.join(admin, "gitdir"), `${path.join(wt, ".git")}\n`);
    write(path.join(wt, ".git"), `gitdir: ${admin}\n`);
    expect(claudeProjectKey(wt)).toBe(bare);
  });

  it("NFC-normalises the key, as the CLI normalises its cwd", () => {
    const decomposed = path.join(root, "café");
    fs.mkdirSync(decomposed);
    const key = claudeProjectKey(decomposed);
    expect(key).toBe(key.normalize("NFC"));
    expect(key.endsWith("café")).toBe(true);
  });

  it("falls back to the resolved path for a folder that does not exist", () => {
    const missing = path.join(root, "gone", "..", "missing");
    expect(claudeProjectKey(missing)).toBe(path.join(root, "missing"));
  });
});
