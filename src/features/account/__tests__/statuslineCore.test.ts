import { describe, expect, it } from "vitest";
import { extractCache, renderDefaultLine } from "../statuslineCore";

/** A realistic statusline payload, mirroring what Claude Code emits. */
const PAYLOAD = JSON.stringify({
  session_id: "abc",
  version: "2.1.86",
  model: { id: "claude-opus-4-6", display_name: "Opus 4.6 (1M context)" },
  session_name: "quota parity work",
  context_window: {
    used_percentage: 3,
    context_window_size: 1_000_000,
    total_input_tokens: 31_000,
    total_output_tokens: 1_200,
    current_usage: {
      input_tokens: 900,
      output_tokens: 1_200,
      cache_creation_input_tokens: 4_100,
      cache_read_input_tokens: 26_000,
    },
  },
  cost: {
    total_cost_usd: 0.97,
    total_duration_ms: 612_839,
    total_lines_added: 214,
    total_lines_removed: 179,
  },
  rate_limits: {
    five_hour: { used_percentage: 6, resets_at: 1_774_731_600 },
    seven_day: { used_percentage: 12, resets_at: 1_775_199_600 },
  },
});

describe("extractCache", () => {
  it("normalises a full payload and stamps the injected time", () => {
    const cache = extractCache(PAYLOAD, 1234);
    expect(cache).not.toBeNull();
    if (!cache) return;
    expect(cache.capturedAt).toBe(1234);
    expect(cache.version).toBe("2.1.86");
    expect(cache.model).toEqual({ id: "claude-opus-4-6", displayName: "Opus 4.6 (1M context)" });
    expect(cache.sessionName).toBe("quota parity work");
    expect(cache.context).toEqual({
      usedPercent: 3,
      size: 1_000_000,
      tokens: {
        totalInput: 31_000,
        totalOutput: 1_200,
        input: 900,
        output: 1_200,
        cacheCreation: 4_100,
        cacheRead: 26_000,
      },
    });
    expect(cache.cost).toEqual({
      totalUsd: 0.97,
      durationMs: 612_839,
      linesAdded: 214,
      linesRemoved: 179,
    });
    expect(cache.rateLimits.fiveHour).toEqual({ usedPercent: 6, resetsAt: 1_774_731_600 });
    expect(cache.rateLimits.sevenDay).toEqual({ usedPercent: 12, resetsAt: 1_775_199_600 });
    // Absent for everyone not behind a Claude gateway — the common case.
    expect(cache.rateLimits.spendLimit).toBeNull();
  });

  it("returns null for non-JSON input", () => {
    expect(extractCache("<not json>", 0)).toBeNull();
  });

  it("returns null for a JSON primitive (not an object)", () => {
    expect(extractCache("42", 0)).toBeNull();
  });

  it("yields nulls for absent sections rather than throwing", () => {
    const cache = extractCache(JSON.stringify({ version: "2.0.0" }), 9);
    expect(cache).not.toBeNull();
    if (!cache) return;
    expect(cache.model).toBeNull();
    expect(cache.context).toBeNull();
    expect(cache.cost).toBeNull();
    expect(cache.rateLimits.fiveHour).toBeNull();
    expect(cache.rateLimits.sevenDay).toBeNull();
    expect(cache.rateLimits.spendLimit).toBeNull();
    expect(cache.sessionName).toBe("");
  });

  it("drops a rate window that has no numeric used_percentage", () => {
    const cache = extractCache(
      JSON.stringify({ rate_limits: { five_hour: { resets_at: 1 }, seven_day: null } }),
      0,
    );
    expect(cache?.rateLimits.fiveHour).toBeNull();
    expect(cache?.rateLimits.sevenDay).toBeNull();
  });
});

describe("renderDefaultLine", () => {
  it("joins the segments the payload provided", () => {
    const cache = extractCache(PAYLOAD, 0)!;
    expect(renderDefaultLine(cache)).toBe("Opus 4.6 (1M context)  ·  ctx 3%  ·  5h 6%  ·  7d 12%");
  });

  it("is empty when no segment has data", () => {
    const cache = extractCache(JSON.stringify({ version: "x" }), 0)!;
    expect(renderDefaultLine(cache)).toBe("");
  });
});

import {
  mergeCaches,
  resolveActiveModel,
  SESSION_CAPTURE_MAX,
  SESSION_CAPTURE_TTL_MS,
  SESSION_FRESH_MS,
  type StatuslineCache,
} from "../statuslineCore";

function cacheWith(
  sessions: NonNullable<StatuslineCache["sessions"]>,
  model: StatuslineCache["model"] = null,
): StatuslineCache {
  return {
    capturedAt: 0,
    version: "2.1.201",
    model,
    context: null,
    cost: null,
    rateLimits: { fiveHour: null, sevenDay: null },
    sessions,
  };
}

const NOW = 1_800_000_000_000;
const fable = { id: "claude-fable-5", displayName: "Fable 5" };
const opus = { id: "claude-opus-4-8", displayName: "Opus 4.8" };
const sonnet = { id: "claude-sonnet-5", displayName: "Sonnet 5" };

describe("extractCache — sessions", () => {
  it("records the render under its session_id", () => {
    const cache = extractCache(
      JSON.stringify({
        session_id: "s-1",
        model: { id: "claude-fable-5", display_name: "Fable 5" },
      }),
      NOW,
    )!;
    expect(cache.sessions).toEqual({
      "s-1": { model: fable, capturedAt: NOW },
    });
  });

  it("yields an empty sessions map when the payload has no session_id", () => {
    const cache = extractCache(JSON.stringify({ model: { id: "x" } }), NOW)!;
    expect(cache.sessions).toEqual({});
  });

  it("records Claude's own cost and context against the session", () => {
    // Claude computes this cost from real usage with the right cache-TTL
    // and per-model rates, so it needs no pricing table of ours — and it
    // must be per-session, since the top-level slot is last-writer-wins
    // across concurrent sessions.
    const cache = extractCache(
      JSON.stringify({
        session_id: "s-1",
        model: { id: "claude-opus-5", display_name: "Opus 5" },
        cost: { total_cost_usd: 2.5 },
        context_window: { used_percentage: 9, context_window_size: 1_000_000 },
      }),
      NOW,
    )!;
    expect(cache.sessions!["s-1"].costUsd).toBe(2.5);
    expect(cache.sessions!["s-1"].contextPercent).toBe(9);
  });

  it("omits cost and context from the capture when the payload lacks them", () => {
    const cache = extractCache(JSON.stringify({ session_id: "s-1" }), NOW)!;
    expect(cache.sessions!["s-1"].costUsd).toBeUndefined();
    expect(cache.sessions!["s-1"].contextPercent).toBeUndefined();
  });
});

describe("extractCache — prompt cache", () => {
  it("captures the prompt-cache block", () => {
    const cache = extractCache(
      JSON.stringify({
        prompt_cache: {
          warm: true,
          ttl: "1h",
          requests: 40,
          misses: 3,
          expected_rebuilds: 2,
          hit_ratio: 0.925,
          cache_write_tokens: 12_000,
          miss_recache_tokens: 8_000,
          caching_observed: true,
          expires_at: 1_789_545_600,
          last_miss_at: 1_789_540_000,
          last_miss_cause: {
            causes: ["tools_changed"],
            tools_added: 2,
            tools_removed: 1,
            system_char_delta: -40,
          },
          miss_causes: { tools_changed: 2, ttl_expired_1h: 1 },
          recache_tokens_if_cold: 48_000,
        },
      }),
      NOW,
    )!;
    expect(cache.promptCache).toEqual({
      warm: true,
      ttl: "1h",
      requests: 40,
      misses: 3,
      expectedRebuilds: 2,
      hitRatio: 0.925,
      cacheWriteTokens: 12_000,
      missRecacheTokens: 8_000,
      cachingObserved: true,
      expiresAt: 1_789_545_600,
      lastMissAt: 1_789_540_000,
      lastMissCause: {
        causes: ["tools_changed"],
        toolsAdded: 2,
        toolsRemoved: 1,
        systemCharDelta: -40,
      },
      missCauses: { tools_changed: 2, ttl_expired_1h: 1 },
      recacheTokensIfCold: 48_000,
    });
  });

  it("is null when Claude has not reported any requests yet", () => {
    expect(extractCache("{}", NOW)!.promptCache).toBeNull();
    expect(
      extractCache(JSON.stringify({ prompt_cache: { warm: false } }), NOW)!
        .promptCache,
    ).toBeNull();
  });
});

describe("mergeCaches", () => {
  it("unions sessions across renders; fresh render wins its own slot", () => {
    const prev = cacheWith({
      "s-opus": { model: opus, capturedAt: NOW - 60_000 },
      "s-fable": { model: sonnet, capturedAt: NOW - 120_000 },
    });
    const fresh = cacheWith({ "s-fable": { model: fable, capturedAt: NOW } }, fable);
    const merged = mergeCaches(prev, fresh, NOW);
    expect(merged.sessions).toEqual({
      "s-opus": { model: opus, capturedAt: NOW - 60_000 },
      "s-fable": { model: fable, capturedAt: NOW },
    });
    // Top-level stays last-writer (backwards compatible).
    expect(merged.model).toEqual(fable);
  });

  it("prunes captures older than the TTL", () => {
    const prev = cacheWith({
      old: { model: opus, capturedAt: NOW - SESSION_CAPTURE_TTL_MS - 1 },
    });
    const merged = mergeCaches(prev, cacheWith({ new: { model: fable, capturedAt: NOW } }), NOW);
    expect(Object.keys(merged.sessions!)).toEqual(["new"]);
  });

  it("caps retained captures at the newest SESSION_CAPTURE_MAX", () => {
    const many: NonNullable<StatuslineCache["sessions"]> = {};
    for (let i = 0; i < SESSION_CAPTURE_MAX + 5; i++) {
      many[`s-${i}`] = { model: opus, capturedAt: NOW - i * 1000 };
    }
    const merged = mergeCaches(cacheWith(many), cacheWith({}), NOW);
    expect(Object.keys(merged.sessions!)).toHaveLength(SESSION_CAPTURE_MAX);
    expect(merged.sessions!["s-0"]).toBeDefined();
    expect(merged.sessions![`s-${SESSION_CAPTURE_MAX + 4}`]).toBeUndefined();
  });

  it("tolerates a null previous cache (first render)", () => {
    const merged = mergeCaches(null, cacheWith({ s: { model: fable, capturedAt: NOW } }), NOW);
    expect(Object.keys(merged.sessions!)).toEqual(["s"]);
  });
});

describe("resolveActiveModel", () => {
  it("returns the model when every fresh session agrees", () => {
    const cache = cacheWith(
      {
        a: { model: fable, capturedAt: NOW - 1000 },
        b: { model: fable, capturedAt: NOW - 2000 },
      },
      fable,
    );
    expect(resolveActiveModel(cache, NOW)).toBe("Fable 5");
  });

  it("returns null when fresh sessions run DIFFERENT models (no honest claim)", () => {
    const cache = cacheWith(
      {
        a: { model: fable, capturedAt: NOW - 1000 },
        b: { model: opus, capturedAt: NOW - 2000 },
        c: { model: sonnet, capturedAt: NOW - 3000 },
      },
      // Last writer happened to be sonnet — must NOT be claimed.
      sonnet,
    );
    expect(resolveActiveModel(cache, NOW)).toBeNull();
  });

  it("falls back to the last-known top-level model when no session is fresh", () => {
    const cache = cacheWith(
      { a: { model: fable, capturedAt: NOW - SESSION_FRESH_MS - 1 } },
      opus,
    );
    expect(resolveActiveModel(cache, NOW)).toBe("Opus 4.8");
  });

  it("handles caches written by older taps (no sessions map)", () => {
    const cache = cacheWith({}, sonnet);
    delete cache.sessions;
    expect(resolveActiveModel(cache, NOW)).toBe("Sonnet 5");
    expect(resolveActiveModel(null, NOW)).toBeNull();
  });
});

import { reviveCache } from "../statuslineCore";

/**
 * The three blocks that say WHERE a session is working, mirroring the
 * CLI's own schema (v2.1.273) key for key. `kind` is deliberately absent:
 * Claude Code omits it for GitHub PRs and sends "mr" only for GitLab.
 */
const PLACE_PAYLOAD = {
  pr: {
    number: 412,
    url: "https://github.com/acme/widgets/pull/412",
    review_state: "changes_requested",
  },
  worktree: {
    name: "my-feature",
    path: "/Users/dev/code/widgets-my-feature",
    branch: "feat/my-feature",
    original_cwd: "/Users/dev/code/widgets",
    original_branch: "main",
  },
  workspace: {
    current_dir: "/Users/dev/code/widgets-my-feature",
    project_dir: "/Users/dev/code/widgets-my-feature",
    added_dirs: [],
    git_worktree: "my-feature",
    repo: { host: "github.com", owner: "acme", name: "widgets" },
  },
};

describe("extractCache — pr / worktree / repo", () => {
  it("normalises all three blocks from a full payload", () => {
    const cache = extractCache(JSON.stringify(PLACE_PAYLOAD), NOW)!;
    expect(cache.pr).toEqual({
      number: 412,
      url: "https://github.com/acme/widgets/pull/412",
      reviewState: "changes_requested",
      kind: "",
    });
    expect(cache.worktree).toEqual({
      name: "my-feature",
      path: "/Users/dev/code/widgets-my-feature",
      branch: "feat/my-feature",
      originalCwd: "/Users/dev/code/widgets",
      originalBranch: "main",
    });
    expect(cache.repo).toEqual({ host: "github.com", owner: "acme", name: "widgets" });
  });

  it("yields nulls, not throws, when every block is absent", () => {
    const cache = extractCache("{}", NOW)!;
    expect(cache.pr).toBeNull();
    expect(cache.worktree).toBeNull();
    expect(cache.repo).toBeNull();
  });

  it("survives the blocks being explicitly null", () => {
    const cache = extractCache(
      JSON.stringify({ pr: null, worktree: null, workspace: null }),
      NOW,
    )!;
    expect(cache.pr).toBeNull();
    expect(cache.worktree).toBeNull();
    expect(cache.repo).toBeNull();
  });

  it("keeps a PR that has no review yet and no kind", () => {
    const cache = extractCache(
      JSON.stringify({ pr: { number: 7, url: "https://example.test/pull/7" } }),
      NOW,
    )!;
    expect(cache.pr).toEqual({
      number: 7,
      url: "https://example.test/pull/7",
      reviewState: "",
      kind: "",
    });
  });

  it("carries the GitLab merge-request kind through verbatim", () => {
    const cache = extractCache(
      JSON.stringify({
        pr: { number: 88, url: "https://gitlab.test/acme/widgets/-/merge_requests/88", kind: "mr" },
      }),
      NOW,
    )!;
    expect(cache.pr?.kind).toBe("mr");
    expect(cache.pr?.number).toBe(88);
  });

  it("keeps a review_state the CLI added after we shipped", () => {
    // The set is closed in the CLI but grows across releases. A value we
    // have never seen must survive the parse — dropping it would silently
    // under-report the PR's status.
    const cache = extractCache(
      JSON.stringify({ pr: { number: 3, review_state: "merge_conflict" } }),
      NOW,
    )!;
    expect(cache.pr?.reviewState).toBe("merge_conflict");
  });

  it("keeps a worktree with no branch and no original branch", () => {
    const cache = extractCache(
      JSON.stringify({ worktree: { name: "spike", path: "/tmp/spike", original_cwd: "/repo" } }),
      NOW,
    )!;
    expect(cache.worktree).toEqual({
      name: "spike",
      path: "/tmp/spike",
      branch: "",
      originalCwd: "/repo",
      originalBranch: "",
    });
  });

  it("returns a null repo when the workspace block carries none", () => {
    // `repo` is derived from the origin remote, so a checkout with no
    // origin has a workspace block and no repo inside it.
    const cache = extractCache(
      JSON.stringify({
        workspace: { current_dir: "/repo", project_dir: "/repo", added_dirs: [] },
      }),
      NOW,
    )!;
    expect(cache.repo).toBeNull();
  });

  it("rejects a repo missing half of owner/name rather than rendering a dangling slash", () => {
    const owner = extractCache(
      JSON.stringify({ workspace: { repo: { host: "github.com", owner: "acme" } } }),
      NOW,
    )!;
    expect(owner.repo).toBeNull();
    const name = extractCache(
      JSON.stringify({ workspace: { repo: { host: "github.com", name: "widgets" } } }),
      NOW,
    )!;
    expect(name.repo).toBeNull();
  });

  it("rejects wrong types cleanly instead of coercing them into nonsense", () => {
    // A string where the number belongs kills the whole block: the number
    // is the only label the link could carry, and "#NaN" is worse than
    // silence.
    const strNumber = extractCache(
      JSON.stringify({ pr: { number: "412", url: "https://example.test/pull/412" } }),
      NOW,
    )!;
    expect(strNumber.pr).toBeNull();

    // A number where the URL belongs drops only the URL — the PR number
    // still orients the user, it just cannot be a link.
    const numUrl = extractCache(JSON.stringify({ pr: { number: 412, url: 9 } }), NOW)!;
    expect(numUrl.pr).toEqual({ number: 412, url: "", reviewState: "", kind: "" });

    // Same rule for the other two blocks' identity fields.
    expect(extractCache(JSON.stringify({ worktree: { name: 7, path: "/x" } }), NOW)!.worktree)
      .toBeNull();
    expect(
      extractCache(JSON.stringify({ workspace: { repo: { owner: 1, name: 2 } } }), NOW)!.repo,
    ).toBeNull();
  });

  it("does not treat an arrayed block as an object", () => {
    const cache = extractCache(
      JSON.stringify({ pr: [], worktree: [], workspace: { repo: [] } }),
      NOW,
    )!;
    expect(cache.pr).toBeNull();
    expect(cache.worktree).toBeNull();
    expect(cache.repo).toBeNull();
  });
});

describe("reviveCache — pr / worktree / repo", () => {
  it("back-fills nulls for a cache written before these fields existed", () => {
    const legacy = {
      capturedAt: 1_700_000_000_000,
      version: "2.1.86",
      model: { id: "claude-opus-4-6", displayName: "Opus 4.6" },
      context: { usedPercent: 3, size: 1_000_000 },
      cost: { totalUsd: 0.97, durationMs: 1, linesAdded: 2, linesRemoved: 3 },
      rateLimits: { fiveHour: { usedPercent: 6, resetsAt: 0 } },
    };
    const cache = reviveCache(legacy)!;
    expect(cache.pr).toBeNull();
    expect(cache.worktree).toBeNull();
    expect(cache.repo).toBeNull();
    // The fields that predate this revision are untouched.
    expect(cache.version).toBe("2.1.86");
    expect(cache.rateLimits.fiveHour).toEqual({ usedPercent: 6, resetsAt: 0 });
  });

  it("round-trips a cache the current tap wrote", () => {
    const fresh = extractCache(JSON.stringify(PLACE_PAYLOAD), NOW)!;
    const revived = reviveCache(JSON.parse(JSON.stringify(fresh)))!;
    expect(revived.pr).toEqual(fresh.pr);
    expect(revived.worktree).toEqual(fresh.worktree);
    expect(revived.repo).toEqual(fresh.repo);
  });

  it("drops persisted blocks whose identity field is unusable", () => {
    const cache = reviveCache({
      capturedAt: 1,
      pr: { number: "412" },
      worktree: { name: "", path: "/x" },
      repo: { owner: "acme" },
    })!;
    expect(cache.pr).toBeNull();
    expect(cache.worktree).toBeNull();
    expect(cache.repo).toBeNull();
  });
});
