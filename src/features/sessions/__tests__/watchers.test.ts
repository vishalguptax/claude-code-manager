import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import * as path from "path";

/**
 * Watcher dispatch tests. We exercise `createWatchers` directly with a
 * hand-rolled WatcherContext and a spied `createFileSystemWatcher` that
 * captures each pattern's change handler, so a test can fire a synthetic
 * file event and assert what gets pushed to the webview.
 *
 * Focus: a transcript append must refresh the Usage tab. The account
 * watcher only fires on settings/credentials writes, never on a
 * transcript append, so the session-data path re-pushes `accountData`
 * itself — otherwise token usage froze for the whole of an active session.
 */

let __parseAccountCalls = 0;
vi.mock("../parser", () => ({
  parseSessions: () => [],
  groupSessions: () => [],
  getStats: () => ({ totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 }),
  getUniqueProjects: () => [],
  getLastParseWarning: () => null,
  // "missing" ids resolve to null (deleted/unreadable) so the no-mutation
  // early-return branch is exercised; everything else reparses cleanly.
  reparseOneSession: (id: string) =>
    id.includes("missing") ? null : { id, endTime: 1, projectPath: "/p" },
  readLiveSessions: () => new Map(),
  applyLiveState: () => false,
}));
vi.mock("../state", () => ({
  loadState: () => ({ pinned: [], deleted: [], renames: {} }),
}));
vi.mock("../../../extension/workspace", () => ({
  getWorkspace: () => undefined,
}));
vi.mock("../../account/parser", () => ({
  parseAccountData: () => {
    __parseAccountCalls++;
    return { profile: { userID: "u-1" } };
  },
}));
// Usage aggregate warm is awaited before the usage re-push; resolve instantly
// so the test only has to flush microtasks, not run the real corpus read.
vi.mock("../../account/projectStats", () => ({
  warmUsageAggregate: () => Promise.resolve(),
}));
vi.mock("../../account/quota", () => ({
  readQuota: () => ({ ok: false }),
}));
vi.mock("../../account/profiles", () => ({
  syncActiveProfile: () => {},
}));

import { createWatchers, type WatcherContext } from "../watchers";

type Handler = (uri: vscode.Uri) => void;
interface Captured {
  base: string;
  glob: string;
  handlers: Handler[];
}

let captured: Captured[];
let posted: Array<{ type: string; [k: string]: unknown }>;
let reloadedFeatures: string[];

function makeCtx(): WatcherContext {
  const sessions: Array<{ id: string }> = [];
  return {
    getWebview: () =>
      ({
        postMessage: (m: { type: string }) => {
          posted.push(m as { type: string });
          return Promise.resolve(true);
        },
      }) as unknown as vscode.Webview,
    getSessions: () => sessions as never,
    setSessions: (s) => {
      sessions.length = 0;
      sessions.push(...(s as Array<{ id: string }>));
    },
    postWorkspacePath: () => {},
    buildSearchIndex: () => {},
    refreshLiveState: () => {},
    checkForIdentityChange: () => {},
    reloadConfigFeature: (feature) => {
      reloadedFeatures.push(feature);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  __parseAccountCalls = 0;
  captured = [];
  posted = [];
  reloadedFeatures = [];
  vi.spyOn(vscode.workspace, "createFileSystemWatcher").mockImplementation(
    (pattern: unknown) => {
      const pat = pattern as { base?: { fsPath?: string }; pattern?: string };
      const entry: Captured = {
        base: pat?.base?.fsPath ?? "",
        glob: typeof pat?.pattern === "string" ? pat.pattern : "",
        handlers: [],
      };
      captured.push(entry);
      const add = (l: Handler) => {
        entry.handlers.push(l);
        return { dispose: () => {} };
      };
      return {
        onDidChange: add,
        onDidCreate: add,
        onDidDelete: add,
        dispose: () => {},
      } as unknown as vscode.FileSystemWatcher;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Find the transcript watcher (base ends with `projects`, glob `**\/*.jsonl`). */
function transcriptWatcher(): Captured {
  const w = captured.find((c) => /projects$/.test(c.base) && c.glob === "**/*.jsonl");
  if (!w) throw new Error("transcript watcher not registered");
  return w;
}

describe("createWatchers — transcript change refreshes the Usage tab", () => {
  it("re-posts accountData after a transcript append (debounced)", async () => {
    const ctx = makeCtx();
    const disposable = createWatchers(ctx);

    const w = transcriptWatcher();
    const fakeUri = {
      fsPath: path.join(w.base, "slug", "abc-123.jsonl"),
    } as vscode.Uri;
    for (const h of w.handlers) h(fakeUri);

    // Nothing fires before the 1000ms session-reparse debounce elapses.
    expect(posted.map((m) => m.type)).not.toContain("accountData");

    vi.advanceTimersByTime(1000);
    // The usage re-push awaits warmUsageAggregate — flush the microtask queue
    // so its continuation (the accountData post) runs before we assert.
    await Promise.resolve();
    await Promise.resolve();

    // Session list refreshed AND usage re-pushed off the same event.
    const types = posted.map((m) => m.type);
    expect(types).toContain("sessions");
    expect(types).toContain("accountData");
    expect(__parseAccountCalls).toBe(1);

    disposable.dispose();
  });

  it("re-posts accountData even when the session list did not change", async () => {
    // reparseOneSession returns null → session dropped / no-op mutation,
    // but a live session may still have burned tokens. The finally-push
    // must run regardless so usage never stalls.
    const ctx = makeCtx();
    const disposable = createWatchers(ctx);

    const w = transcriptWatcher();
    const fakeUri = {
      fsPath: path.join(w.base, "slug", "missing.jsonl"),
    } as vscode.Uri;
    for (const h of w.handlers) h(fakeUri);
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(posted.map((m) => m.type)).toContain("accountData");

    disposable.dispose();
  });
});

describe("createWatchers — config artifacts update live", () => {
  /** First captured watcher whose glob matches. */
  function watcherByGlob(glob: string): Captured {
    const w = captured.find((c) => c.glob === glob);
    if (!w) throw new Error(`no watcher registered for glob ${glob}`);
    return w;
  }

  it.each([
    ["skills", "**/SKILL.md"],
    ["commands", "**/*.{md,toml}"],
    ["agents", "**/*.md"],
    ["mcp", "mcp.json"],
    ["hooks", "settings.json"],
  ])("re-parses %s when its files change (debounced)", (feature, glob) => {
    const ctx = makeCtx();
    const disposable = createWatchers(ctx);

    const w = watcherByGlob(glob);
    for (const h of w.handlers) h({ fsPath: "x" } as vscode.Uri);

    // Nothing before the per-feature debounce elapses.
    expect(reloadedFeatures).not.toContain(feature);
    vi.advanceTimersByTime(250);
    expect(reloadedFeatures).toContain(feature);

    disposable.dispose();
  });

  it("coalesces a burst of edits into a single reparse", () => {
    const ctx = makeCtx();
    const disposable = createWatchers(ctx);

    const w = watcherByGlob("**/SKILL.md");
    const fire = () => {
      for (const h of w.handlers) h({ fsPath: "x" } as vscode.Uri);
    };
    fire();
    vi.advanceTimersByTime(100);
    fire(); // resets the debounce
    vi.advanceTimersByTime(100);
    fire();
    vi.advanceTimersByTime(250);

    expect(reloadedFeatures.filter((f) => f === "skills")).toHaveLength(1);

    disposable.dispose();
  });

  it("does not fire any config reload before files change", () => {
    const ctx = makeCtx();
    const disposable = createWatchers(ctx);
    vi.advanceTimersByTime(1000);
    expect(reloadedFeatures).toEqual([]);
    disposable.dispose();
  });
});
