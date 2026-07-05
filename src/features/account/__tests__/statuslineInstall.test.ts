import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * In-memory filesystem the mocks operate on. The writeSettingsValue
 * mock APPLIES writes to this vfs (not just records them) so the
 * installer's read-after-write logic behaves as it does on disk.
 */
const fsState = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  removed: [] as string[],
}));

vi.mock("fs", () => {
  const enoent = (): never => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    throw err;
  };
  return {
    mkdirSync: (p: string): void => {
      fsState.dirs.add(String(p));
    },
    existsSync: (p: string): boolean =>
      fsState.files.has(String(p)) || fsState.dirs.has(String(p)),
    copyFileSync: (src: string, dst: string): void => {
      const v = fsState.files.get(String(src));
      if (v === undefined) enoent();
      fsState.files.set(String(dst), v!);
    },
    readFileSync: (p: string): string => {
      const v = fsState.files.get(String(p));
      if (v === undefined) enoent();
      return v!;
    },
    writeFileSync: (p: string, data: string): void => {
      fsState.files.set(String(p), String(data));
    },
    renameSync: (from: string, to: string): void => {
      const v = fsState.files.get(String(from));
      if (v === undefined) enoent();
      fsState.files.delete(String(from));
      fsState.files.set(String(to), v);
    },
    unlinkSync: (p: string): void => {
      fsState.files.delete(String(p));
    },
    rmSync: (p: string): void => {
      if (!fsState.files.has(String(p))) enoent();
      fsState.files.delete(String(p));
      fsState.removed.push(String(p));
    },
  };
});

/**
 * writeSettingsValue mock — applies the statusLine.command mutation to
 * the vfs file AND records the call for assertions.
 */
const settings = vi.hoisted(() => ({
  calls: [] as Array<{
    key: string;
    value: unknown;
    scope?: string;
    workspacePath?: string;
  }>,
}));

vi.mock("../parser", async () => {
  const cfg = await vi.importActual<typeof import("../../../core/config")>(
    "../../../core/config",
  );
  const p = await vi.importActual<typeof import("path")>("path");
  const settingsFileFor = (scope: string, workspacePath?: string): string | null => {
    if (scope === "global") return cfg.SETTINGS_FILE;
    if (!workspacePath) return null;
    if (scope === "project") return p.join(workspacePath, ".claude", "settings.json");
    if (scope === "local") return p.join(workspacePath, ".claude", "settings.local.json");
    return null;
  };
  return {
    writeSettingsValue: (
      key: string,
      value: unknown,
      scope: string = "global",
      workspacePath?: string,
    ): boolean => {
      settings.calls.push({ key, value, scope, workspacePath });
      if (key !== "statusLine.command") return true;
      const filePath = settingsFileFor(scope, workspacePath);
      if (!filePath) return false;
      let data: Record<string, unknown> = {};
      const raw = fsState.files.get(filePath);
      if (raw !== undefined) {
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (value === undefined || value === null || value === "") {
        delete data.statusLine;
      } else {
        data.statusLine = { type: "command", command: value };
      }
      fsState.files.set(filePath, JSON.stringify(data));
      return true;
    },
  };
});

/** Deterministic node-path resolution so the installed command is stable. */
vi.mock("child_process", () => ({
  execFileSync: (): string => "/usr/bin/node\n",
}));

import {
  SETTINGS_FILE,
  STATUSLINE_CACHE_FILE,
  STATUSLINE_INNER_FILE,
  STATUSLINE_TAP_FILE,
} from "../../../core/config";
import {
  detectForeignProjectTap,
  installStatusline,
  isStatuslineInstalled,
  removeForeignProjectTap,
  resolveEffectiveScope,
  selfHealStatusline,
  uninstallStatusline,
} from "../statuslineInstall";
import { parseInner, isV2, type InnerRecordV2 } from "../statuslineInner";

const TAP_COMMAND = `"/usr/bin/node" "${STATUSLINE_TAP_FILE}"`;
const TAP_SOURCE = "/dist/statusline-tap.js";
const WS = "/fake-ws";
const PROJECT_SETTINGS = path.join(WS, ".claude", "settings.json");
const LOCAL_SETTINGS = path.join(WS, ".claude", "settings.local.json");
const FOREIGN_TAP =
  '"C:\\nvm4w\\nodejs\\node.exe" "C:\\Users\\001ch\\.claude\\.claude-manager\\statusline-tap.js"';

function seedSettingsAt(filePath: string, command: string | null): void {
  if (command === null) {
    fsState.files.set(filePath, JSON.stringify({}));
  } else {
    fsState.files.set(filePath, JSON.stringify({ statusLine: { command } }));
  }
}

function commandAt(filePath: string): string | null {
  const raw = fsState.files.get(filePath);
  if (raw === undefined) return null;
  const data = JSON.parse(raw) as { statusLine?: { command?: string } };
  return data.statusLine?.command ?? null;
}

function readSidecar(): InnerRecordV2 {
  const rec = parseInner(fsState.files.get(STATUSLINE_INNER_FILE)!)!;
  if (!isV2(rec)) throw new Error("expected v2 sidecar");
  return rec;
}

beforeEach(() => {
  fsState.files.clear();
  fsState.dirs.clear();
  fsState.removed = [];
  settings.calls = [];
  // Bundled tap source + node binary + workspace dir exist by default.
  fsState.files.set(TAP_SOURCE, "TAP-SOURCE-V1");
  fsState.files.set("/usr/bin/node", "ELF");
  fsState.dirs.add(WS);
});

// ── resolveEffectiveScope (unchanged semantics) ──

describe("resolveEffectiveScope", () => {
  it("prefers local over project over global", () => {
    seedSettingsAt(SETTINGS_FILE, "global.sh");
    seedSettingsAt(PROJECT_SETTINGS, "project.sh");
    seedSettingsAt(LOCAL_SETTINGS, "local.sh");
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "local", command: "local.sh" });
  });

  it("falls to global when no workspace scope defines statusLine", () => {
    seedSettingsAt(SETTINGS_FILE, "global.sh");
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "global", command: "global.sh" });
  });

  it("defaults to empty global when nothing is defined", () => {
    expect(resolveEffectiveScope(WS)).toEqual({ scope: "global", command: "" });
  });
});

// ── install: global-first ──

describe("installStatusline (global-first)", () => {
  it("installs at GLOBAL scope on a clean machine and records an empty prior", () => {
    const res = installStatusline(TAP_SOURCE, WS);
    expect(res.ok).toBe(true);
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
    // No shadowing → no local override, project untouched.
    expect(fsState.files.has(LOCAL_SETTINGS)).toBe(false);
    const rec = readSidecar();
    expect(rec.global).toEqual({ priorCommand: "" });
    expect(rec.workspaces).toEqual({});
    // Tap script copied.
    expect(fsState.files.get(STATUSLINE_TAP_FILE)).toBe("TAP-SOURCE-V1");
  });

  it("chains an existing global statusline", () => {
    seedSettingsAt(SETTINGS_FILE, "my-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
    expect(readSidecar().global).toEqual({ priorCommand: "my-bar.sh" });
  });

  it("NEVER writes the tap into project scope — shadowing project statusline gets a local override", () => {
    seedSettingsAt(PROJECT_SETTINGS, "project-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    // Shared file untouched.
    expect(commandAt(PROJECT_SETTINGS)).toBe("project-bar.sh");
    // Local override wins precedence, chains the project command.
    expect(commandAt(LOCAL_SETTINGS)).toBe(TAP_COMMAND);
    expect(readSidecar().workspaces[WS]).toEqual({
      sourceScope: "project",
      priorCommand: "project-bar.sh",
    });
  });

  it("takes over a user's local statusline and records it for restore", () => {
    seedSettingsAt(LOCAL_SETTINGS, "my-local.sh");
    installStatusline(TAP_SOURCE, WS);
    expect(commandAt(LOCAL_SETTINGS)).toBe(TAP_COMMAND);
    expect(readSidecar().workspaces[WS]).toEqual({
      sourceScope: "local",
      priorCommand: "my-local.sh",
    });
  });

  it("repairs a poisoned project entry (foreign machine's tap committed)", () => {
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    const res = installStatusline(TAP_SOURCE, WS);
    expect(res.ok && res.repairedProject).toBe(true);
    // Foreign entry removed from the shared file, not replaced by ours.
    expect(commandAt(PROJECT_SETTINGS)).toBeNull();
    // Global carries the install; no local override needed.
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
    expect(commandAt(LOCAL_SETTINGS)).toBeNull();
  });

  it("never records a foreign tap as the chain/restore command", () => {
    seedSettingsAt(SETTINGS_FILE, FOREIGN_TAP);
    installStatusline(TAP_SOURCE, WS);
    expect(readSidecar().global).toEqual({ priorCommand: "" });
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
  });

  it("re-resolves when the baked node path died (nvm switch)", () => {
    seedSettingsAt(SETTINGS_FILE, `"/old/node" "${STATUSLINE_TAP_FILE}"`);
    // /old/node does not exist in the vfs → unhealthy → rewrite.
    installStatusline(TAP_SOURCE, WS);
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
    // Prior stays empty — the dead command was ours, not the user's.
    expect(readSidecar().global).toEqual({ priorCommand: "" });
  });

  it("is idempotent — a second install changes nothing", () => {
    seedSettingsAt(PROJECT_SETTINGS, "project-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    const callsAfterFirst = settings.calls.length;
    installStatusline(TAP_SOURCE, WS);
    expect(settings.calls.length).toBe(callsAfterFirst);
    expect(readSidecar().workspaces[WS].priorCommand).toBe("project-bar.sh");
  });

  it("covers a second workspace without losing the first's record", () => {
    seedSettingsAt(PROJECT_SETTINGS, "a-bar.sh");
    installStatusline(TAP_SOURCE, WS);

    const WS_B = "/fake-ws-b";
    fsState.dirs.add(WS_B);
    seedSettingsAt(path.join(WS_B, ".claude", "settings.json"), "b-bar.sh");
    installStatusline(TAP_SOURCE, WS_B);

    const rec = readSidecar();
    expect(rec.workspaces[WS]).toEqual({ sourceScope: "project", priorCommand: "a-bar.sh" });
    expect(rec.workspaces[WS_B]).toEqual({ sourceScope: "project", priorCommand: "b-bar.sh" });
  });

  it("prunes records for workspaces that no longer exist", () => {
    seedSettingsAt(PROJECT_SETTINGS, "a-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    fsState.dirs.delete(WS);
    installStatusline(TAP_SOURCE);
    expect(readSidecar().workspaces[WS]).toBeUndefined();
  });

  it("works with no workspace open (global only)", () => {
    const res = installStatusline(TAP_SOURCE);
    expect(res.ok).toBe(true);
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
  });
});

// ── isStatuslineInstalled ──

describe("isStatuslineInstalled", () => {
  it("true when the effective command is this machine's healthy tap", () => {
    installStatusline(TAP_SOURCE, WS);
    expect(isStatuslineInstalled(WS)).toBe(true);
  });

  it("false for a foreign machine's tap (wrong paths)", () => {
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    expect(isStatuslineInstalled(WS)).toBe(false);
  });

  it("false when the baked node binary no longer exists", () => {
    seedSettingsAt(SETTINGS_FILE, `"/gone/node" "${STATUSLINE_TAP_FILE}"`);
    expect(isStatuslineInstalled(WS)).toBe(false);
  });
});

// ── uninstall ──

describe("uninstallStatusline", () => {
  it("restores the prior global command", () => {
    seedSettingsAt(SETTINGS_FILE, "my-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    uninstallStatusline(WS);
    expect(commandAt(SETTINGS_FILE)).toBe("my-bar.sh");
    expect(fsState.removed).toContain(STATUSLINE_INNER_FILE);
    expect(fsState.removed).toContain(STATUSLINE_TAP_FILE);
  });

  it("deletes the local override we created for a project statusline", () => {
    seedSettingsAt(PROJECT_SETTINGS, "project-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    uninstallStatusline(WS);
    // Local key gone → project supplies the command again.
    expect(commandAt(LOCAL_SETTINGS)).toBeNull();
    expect(commandAt(PROJECT_SETTINGS)).toBe("project-bar.sh");
    expect(commandAt(SETTINGS_FILE)).toBeNull();
  });

  it("restores the user's own local statusline", () => {
    seedSettingsAt(LOCAL_SETTINGS, "my-local.sh");
    installStatusline(TAP_SOURCE, WS);
    uninstallStatusline(WS);
    expect(commandAt(LOCAL_SETTINGS)).toBe("my-local.sh");
  });

  it("cleans up EVERY workspace recorded in the sidecar, not just the current one", () => {
    seedSettingsAt(PROJECT_SETTINGS, "a-bar.sh");
    installStatusline(TAP_SOURCE, WS);
    const WS_B = "/fake-ws-b";
    fsState.dirs.add(WS_B);
    seedSettingsAt(path.join(WS_B, ".claude", "settings.local.json"), "b-local.sh");
    installStatusline(TAP_SOURCE, WS_B);

    // Uninstall from workspace A must still restore B's local command.
    uninstallStatusline(WS);
    expect(commandAt(path.join(WS_B, ".claude", "settings.local.json"))).toBe("b-local.sh");
    expect(commandAt(LOCAL_SETTINGS)).toBeNull();
  });

  it("leaves a slot alone when the user replaced our tap by hand", () => {
    installStatusline(TAP_SOURCE, WS);
    seedSettingsAt(SETTINGS_FILE, "user-took-over.sh");
    uninstallStatusline(WS);
    expect(commandAt(SETTINGS_FILE)).toBe("user-took-over.sh");
  });

  it("sweeps a foreign tap from the current workspace's project scope", () => {
    installStatusline(TAP_SOURCE, WS);
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    uninstallStatusline(WS);
    expect(commandAt(PROJECT_SETTINGS)).toBeNull();
  });
});

// ── self-heal ──

describe("selfHealStatusline", () => {
  it("no-ops entirely when the user never enabled quota (no sidecar)", () => {
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    const res = selfHealStatusline(TAP_SOURCE, WS);
    expect(res.ok).toBe(true);
    expect(settings.calls).toEqual([]);
    // The foreign entry stays — cleanup is offered via notification.
    expect(commandAt(PROJECT_SETTINGS)).toBe(FOREIGN_TAP);
  });

  it("re-wires global when settings got reverted", () => {
    installStatusline(TAP_SOURCE, WS);
    seedSettingsAt(SETTINGS_FILE, null); // statusLine key wiped
    selfHealStatusline(TAP_SOURCE, WS);
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
  });

  it("refreshes stale tap script bytes after an extension update", () => {
    installStatusline(TAP_SOURCE, WS);
    fsState.files.set(TAP_SOURCE, "TAP-SOURCE-V2");
    selfHealStatusline(TAP_SOURCE, WS);
    expect(fsState.files.get(STATUSLINE_TAP_FILE)).toBe("TAP-SOURCE-V2");
  });

  it("extends coverage to a newly-opened shadowed workspace", () => {
    installStatusline(TAP_SOURCE); // enabled with no workspace
    const WS_B = "/fake-ws-b";
    fsState.dirs.add(WS_B);
    seedSettingsAt(path.join(WS_B, ".claude", "settings.json"), "b-bar.sh");
    selfHealStatusline(TAP_SOURCE, WS_B);
    expect(commandAt(path.join(WS_B, ".claude", "settings.local.json"))).toBe(TAP_COMMAND);
    expect(readSidecar().workspaces[WS_B]).toEqual({
      sourceScope: "project",
      priorCommand: "b-bar.sh",
    });
  });

  it("migrates a v1 project-scope sidecar: repairs the shared file, moves the tap to local", () => {
    // Pre-fix state: tap written into the shared project settings.
    seedSettingsAt(PROJECT_SETTINGS, TAP_COMMAND);
    fsState.files.set(
      STATUSLINE_INNER_FILE,
      JSON.stringify({ scope: "project", command: "orig-bar.sh", workspacePath: WS }),
    );
    selfHealStatusline(TAP_SOURCE, WS);
    // Shared file restored to the original command.
    expect(commandAt(PROJECT_SETTINGS)).toBe("orig-bar.sh");
    // Tap now at global + local override chaining the project command.
    expect(commandAt(SETTINGS_FILE)).toBe(TAP_COMMAND);
    expect(commandAt(LOCAL_SETTINGS)).toBe(TAP_COMMAND);
    const rec = readSidecar();
    expect(rec.workspaces[WS]).toEqual({
      sourceScope: "project",
      priorCommand: "orig-bar.sh",
    });
  });

  it("migrates a v1 global-scope sidecar preserving the prior command", () => {
    seedSettingsAt(SETTINGS_FILE, TAP_COMMAND);
    fsState.files.set(
      STATUSLINE_INNER_FILE,
      JSON.stringify({ scope: "global", command: "orig-global.sh" }),
    );
    selfHealStatusline(TAP_SOURCE, WS);
    const rec = readSidecar();
    expect(rec.version).toBe(2);
    expect(rec.global).toEqual({ priorCommand: "orig-global.sh" });
    // Uninstall after migration restores faithfully.
    uninstallStatusline(WS);
    expect(commandAt(SETTINGS_FILE)).toBe("orig-global.sh");
  });
});

// ── foreign-tap detection (notification path) ──

describe("detectForeignProjectTap / removeForeignProjectTap", () => {
  it("detects any machine's tap in project scope", () => {
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    expect(detectForeignProjectTap(WS)).toBe(true);
  });

  it("does not flag a real user statusline", () => {
    seedSettingsAt(PROJECT_SETTINGS, "team-bar.sh");
    expect(detectForeignProjectTap(WS)).toBe(false);
  });

  it("removes the entry on approval", () => {
    seedSettingsAt(PROJECT_SETTINGS, FOREIGN_TAP);
    expect(removeForeignProjectTap(WS)).toBe(true);
    expect(commandAt(PROJECT_SETTINGS)).toBeNull();
    expect(detectForeignProjectTap(WS)).toBe(false);
  });
});
