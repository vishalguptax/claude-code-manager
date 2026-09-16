import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planEnabledPlugins, setPluginEnabled, writableScope } from "../state";

const CAVEMAN = "caveman@caveman";
const SEO = "claude-seo@agricidaniel-claude-seo";

describe("writableScope", () => {
  it("passes the three file scopes through and refuses managed", () => {
    expect(writableScope("global")).toBe("global");
    expect(writableScope("project")).toBe("project");
    expect(writableScope("local")).toBe("local");
    expect(writableScope("managed")).toBeNull();
  });
});

describe("planEnabledPlugins", () => {
  it("creates the map when the key is absent", () => {
    expect(planEnabledPlugins(undefined, CAVEMAN, true)).toEqual({ [CAVEMAN]: true });
    expect(planEnabledPlugins(null, CAVEMAN, false)).toEqual({ [CAVEMAN]: false });
  });

  it("leaves every sibling entry byte-identical", () => {
    const current = { [SEO]: true, "pinned@m": ["2.x"], "ext@m": { version: "1.2" } };
    expect(planEnabledPlugins(current, CAVEMAN, true)).toEqual({
      ...current,
      [CAVEMAN]: true,
    });
  });

  it("does not mutate the map it was given", () => {
    const current = { [SEO]: true };
    planEnabledPlugins(current, CAVEMAN, true);
    expect(current).toEqual({ [SEO]: true });
  });

  it("keeps an extended entry's version pin when only the switch changes", () => {
    const current = { [CAVEMAN]: { version: "2.x", enabled: true } };
    expect(planEnabledPlugins(current, CAVEMAN, false)).toEqual({
      [CAVEMAN]: { version: "2.x", enabled: false },
    });
  });

  it("replaces an array entry with the plain boolean", () => {
    expect(planEnabledPlugins({ [CAVEMAN]: ["2.x"] }, CAVEMAN, false)).toEqual({
      [CAVEMAN]: false,
    });
  });

  it("refuses when enabledPlugins is not an object", () => {
    expect(planEnabledPlugins([CAVEMAN], CAVEMAN, true)).toBeNull();
    expect(planEnabledPlugins("caveman", CAVEMAN, true)).toBeNull();
  });

  it("refuses an id that tries to traverse", () => {
    expect(planEnabledPlugins({}, "../../etc/passwd@evil", true)).toBeNull();
  });
});

describe("setPluginEnabled", () => {
  const ROOT = path.join(os.tmpdir(), "claude-manager-plugins-state-test");
  const WORKSPACE = path.join(ROOT, "repo");

  beforeEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(path.join(WORKSPACE, ".claude"), { recursive: true });
  });
  afterEach(() => fs.rmSync(ROOT, { recursive: true, force: true }));

  function writeProjectSettings(contents: string): void {
    fs.writeFileSync(path.join(WORKSPACE, ".claude", "settings.json"), contents);
  }

  it("hands the writer the whole merged map at the requested scope", () => {
    writeProjectSettings(
      JSON.stringify({ permissions: { allow: ["Bash"] }, enabledPlugins: { [SEO]: true } }),
    );
    const write = vi.fn().mockReturnValue(true);

    expect(setPluginEnabled(CAVEMAN, true, "project", WORKSPACE, write)).toEqual({ ok: true });
    expect(write).toHaveBeenCalledWith(
      "enabledPlugins",
      { [SEO]: true, [CAVEMAN]: true },
      "project",
      WORKSPACE,
    );
  });

  it("writes only the enabledPlugins key, leaving siblings to the writer", () => {
    writeProjectSettings(JSON.stringify({ hooks: {}, model: "opus" }));
    const write = vi.fn().mockReturnValue(true);
    setPluginEnabled(CAVEMAN, false, "project", WORKSPACE, write);
    expect(write.mock.calls[0][0]).toBe("enabledPlugins");
    expect(write.mock.calls[0][1]).toEqual({ [CAVEMAN]: false });
  });

  it("is read-only with no writer injected, and says so", () => {
    const result = setPluginEnabled(CAVEMAN, true, "global", WORKSPACE, undefined);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("can't write settings.json yet");
  });

  it("refuses to edit managed settings", () => {
    const write = vi.fn().mockReturnValue(true);
    const result = setPluginEnabled(CAVEMAN, true, "managed", WORKSPACE, write);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("organisation");
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses a project scope with no workspace open", () => {
    const write = vi.fn().mockReturnValue(true);
    const result = setPluginEnabled(CAVEMAN, true, "project", undefined, write);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No workspace folder open");
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses an unsafe plugin id before touching anything", () => {
    const write = vi.fn().mockReturnValue(true);
    const result = setPluginEnabled("../../etc/passwd@evil", true, "project", WORKSPACE, write);
    expect(result.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses to write into a settings file it cannot parse", () => {
    writeProjectSettings("{ oops");
    const write = vi.fn().mockReturnValue(true);
    const result = setPluginEnabled(CAVEMAN, true, "project", WORKSPACE, write);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("could not be read");
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses when enabledPlugins in the file is the wrong shape", () => {
    writeProjectSettings(JSON.stringify({ enabledPlugins: ["caveman@caveman"] }));
    const write = vi.fn().mockReturnValue(true);
    const result = setPluginEnabled(CAVEMAN, true, "project", WORKSPACE, write);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("is not an object");
    expect(write).not.toHaveBeenCalled();
  });

  it("creates the map when the settings file does not exist yet", () => {
    const write = vi.fn().mockReturnValue(true);
    expect(setPluginEnabled(CAVEMAN, true, "local", WORKSPACE, write)).toEqual({ ok: true });
    expect(write.mock.calls[0][1]).toEqual({ [CAVEMAN]: true });
  });

  it("reports a failed write as a failure rather than a success", () => {
    const write = vi.fn().mockReturnValue(false);
    const result = setPluginEnabled(CAVEMAN, true, "local", WORKSPACE, write);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Failed to write");
  });
});
