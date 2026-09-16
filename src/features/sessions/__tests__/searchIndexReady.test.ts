import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * buildSearchIndex fills the transcript index in background chunks while the
 * webview is already interactive. A search typed during that window scans a
 * partial corpus, and the webview caches the (often empty) reply against the
 * live query — so the user sees no transcript hits and retyping the same word
 * cannot refresh it. The completion message is what breaks that deadlock, so
 * these tests pin down exactly when it is sent.
 */
vi.mock("../searchIndex", () => ({
  indexSession: vi.fn(),
  pruneIndex: vi.fn(),
  clearIndex: vi.fn(),
}));
vi.mock("../../../extension/workspace", () => ({ getWorkspace: () => undefined }));
vi.mock("../worktreeEnrichment", () => ({ postWorktrees: vi.fn() }));

import { buildSearchIndex } from "../providerActions";
import type { Session } from "../types";

function session(id: string): Session {
  return {
    id,
    name: "",
    project: "proj",
    // No projectPath and no on-disk index entry, so the builder resolves an
    // empty file path and skips extraction — these tests are about chunk
    // scheduling, not about reading transcripts.
    projectPath: "",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 0,
    summary: "",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
  };
}

function makeCtx(sessions: Session[]) {
  const posted: Array<{ type: string }> = [];
  let gen = 0;
  return {
    posted,
    bumpGen: () => ++gen,
    ctx: {
      getSessions: () => sessions,
      isDisposed: () => false,
      nextIndexBuildGen: () => ++gen,
      getIndexBuildGen: () => gen,
      getWebview: () => ({
        postMessage: (m: { type: string }) => {
          posted.push(m);
          return Promise.resolve(true);
        },
      }),
    },
  };
}

describe("buildSearchIndex completion signal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces readiness once the last chunk lands", async () => {
    const { posted, ctx } = makeCtx([session("a"), session("b")]);

    buildSearchIndex(ctx as never);
    expect(posted).toHaveLength(0); // build is scheduled, not synchronous

    await vi.runAllTimersAsync();

    expect(posted).toEqual([{ type: "searchIndexReady" }]);
  });

  it("announces readiness for an empty session list", async () => {
    const { posted, ctx } = makeCtx([]);

    buildSearchIndex(ctx as never);
    await vi.runAllTimersAsync();

    expect(posted).toEqual([{ type: "searchIndexReady" }]);
  });

  it("announces readiness exactly once across many chunks", async () => {
    // 120 sessions spans three 50-session chunks.
    const { posted, ctx } = makeCtx(Array.from({ length: 120 }, (_, i) => session(`s${i}`)));

    buildSearchIndex(ctx as never);
    await vi.runAllTimersAsync();

    expect(posted).toEqual([{ type: "searchIndexReady" }]);
  });

  it("stays silent when a newer build supersedes it", async () => {
    const { posted, ctx, bumpGen } = makeCtx(
      Array.from({ length: 120 }, (_, i) => session(`s${i}`)),
    );

    buildSearchIndex(ctx as never);
    // A second build starts before the first finishes; the stale one must not
    // report a readiness its partial index does not justify.
    bumpGen();
    await vi.runAllTimersAsync();

    expect(posted).toHaveLength(0);
  });
});
