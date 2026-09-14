/* Stub host for marketing screenshots.
   ALL DATA IS FICTIONAL. No real account, project, path or usage figure
   appears here — the person is "Alex Rivera <alex@example.dev>" working on
   invented "acme-*" repositories. */
(function () {
  const now = Date.now();
  const min = 60000,
    hr = 3600000,
    day = 86400000;
  // Aliased: `day` is shadowed inside the usage builders below.
  const day_ = day;

  const session = (id, name, over = {}) => ({
    id,
    name,
    project: "acme-billing",
    projectPath: "/Users/alex/acme-billing",
    branch: "main",
    entrypoint: "cli",
    startTime: now - hr,
    endTime: now - 2 * min,
    messageCount: 24,
    summary: name,
    prompts: [name],
    projectKey: "acme-billing",
    searchHaystack: name.toLowerCase(),
    ...over,
  });

  const sessions = [
    session("a", "Ship the payment retry queue", {
      isLive: true,
      status: "busy",
      endTime: now - 2 * min,
      branch: "feat/retry-queue",
      prompts: ["add exponential backoff to the webhook retries, cap at 6 attempts"],
    }),
    session("b", "Invoice totals drift on partial refunds", {
      branch: "fix/refund-totals",
      isLive: true,
      status: "awaiting_permission",
      endTime: now - 18 * min,
    }),
    session("c", "Rate-limit the public search endpoint", { endTime: now - hr }),
    session("d", "Hero image jumps while the page loads", {
      project: "acme-web",
      projectKey: "acme-web",
      projectPath: "/Users/alex/acme-web",
      endTime: now - 3 * hr,
    }),
    session("e", "Stop the installer clobbering settings.json", { endTime: now - day }),
    session("f", "Draft the 3.2 release notes", { endTime: now - day - 3 * hr }),
    session("g", "Usage chart labels drift by one column", {
      branch: "fix/chart-labels",
      endTime: now - day - 7 * hr,
    }),
    session("h", "Worktree badge for sibling checkouts", { endTime: now - 2 * day }),
    session("i", "Validate connector args before writing", { endTime: now - 3 * day }),
  ];

  const skills = [
    { id: "p1", name: "release", description: "Curate a release: categorise commits, write notes, bump the version", scope: "project", path: "/p/.claude/skills/release", content: "# release", tags: ["changelog", "npm"], group: "" },
    { id: "p2", name: "frontend-conventions", description: "Component, state and styling conventions for the web app", scope: "project", path: "/p/.claude/skills/fc", content: "#", tags: ["react", "css"], group: "" },
    { id: "p3", name: "api-conventions", description: "Service conventions: handlers, migrations and error shapes", scope: "project", path: "/p/.claude/skills/bc", content: "#", tags: [], group: "" },
    { id: "g1", name: "design-review", description: "Critique and polish an interface before it ships", scope: "global", path: "~/.claude/skills/dr", content: "#", tags: [], group: "" },
    { id: "g2", name: "technical-writing", description: "Structured writing methodology for document review", scope: "global", path: "~/.claude/skills/tw", content: "#", tags: [], group: "" },
    { id: "x1", name: "changelog-entry", description: "Generate a changelog entry from a diff", scope: "plugin", pluginName: "release-kit@marketplace", path: "~/x", content: "#", tags: [], group: "" },
  ];

  const commands = [
    { name: "plan", scope: "project", content: "Bound the problem, list what could go wrong, and write the plan before touching code.", path: "/p/.claude/commands/plan.md", description: "Bound the problem, de-risk it, produce a written plan" },
    { name: "build", scope: "project", content: "Work the plan scope by scope, running the checks between each one.", path: "/p/.claude/commands/build.md", description: "Execute the plan scope by scope with checks between each" },
    { name: "ship", scope: "project", content: "Merge the PR, mark the plan shipped, then delete the branch and worktree.", path: "/p/.claude/commands/ship.md", description: "Merge the PR, mark the plan shipped, clean up branches" },
    { name: "init", scope: "builtin", content: "", path: "", description: "Initialize a new CLAUDE.md with codebase documentation" },
    { name: "security-review", scope: "builtin", content: "", path: "", description: "Security review of the pending changes on this branch" },
    { name: "changelog", scope: "plugin", pluginName: "release-kit@marketplace", content: "Write the changelog entry for this release from the merged commits.", path: "/x", description: "Write the changelog entry for this release" },
  ];

  const agents = [
    { name: "api", description: "Service implementation: handlers, migrations and tests", model: "sonnet", tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"], path: "/p/.claude/agents/api.md", content: "#", scope: "project" },
    { name: "frontend", description: "Web implementation: components, state and styles", model: "sonnet", tools: ["Read", "Write", "Edit", "Bash"], path: "/p/.claude/agents/frontend.md", content: "#", scope: "project" },
    { name: "reviewer", description: "Read-only reviewer. Cannot edit files, enforced mechanically rather than by instruction", model: "opus", tools: ["Read", "Glob", "Grep"], path: "/p/.claude/agents/reviewer.md", content: "#", scope: "project" },
    { name: "migrator", description: "Write and review database migrations, forward and back", model: "opus", path: "/p/.claude/agents/migrator.md", content: "#", scope: "project" },
    { name: "technical-writer", description: "Document structure review and editorial guidance", model: "inherit", path: "/p/.claude/agents/tw.md", content: "#", scope: "project" },
  ];

  const mcpServers = [
    { name: "github", type: "http", url: "https://api.githubcopilot.com/mcp/", scope: "project" },
    { name: "postgres", type: "stdio", command: "npx", args: ["@acme/postgres-mcp"], scope: "project" },
    { name: "linear", type: "sse", url: "https://mcp.linear.app/sse", scope: "global" },
    { name: "sentry", type: "http", url: "https://mcp.sentry.dev/", scope: "global" },
    { name: "staging-db", type: "stdio", command: "npx", args: ["@acme/postgres-mcp"], scope: "global", disabled: true },
    { name: "search", type: "stdio", command: "npx", args: ["search-mcp-server"], scope: "plugin", pluginName: "search-kit@marketplace" },
  ];

  const hook = (event, matcher, command, scope, over = {}) => ({
    event, matcher, command, scope, disabled: false, entryIndex: 0, commandIndex: 0, ...over,
  });
  const hooks = [
    hook("SessionStart", "", "~/.claude/hooks/load-context.sh", "global"),
    hook("SessionStart", "", "scripts/session-start.sh", "project", { entryIndex: 1 }),
    hook("PreToolUse", "Bash", "scripts/guard-push.sh", "project", { entryIndex: 2 }),
    hook("PreToolUse", "Write|Edit", 'pnpm exec prettier --write "$FILE"', "project", { entryIndex: 3 }),
    hook("PreToolUse", "", "scripts/trace.sh", "local", { entryIndex: 4, disabled: true }),
    hook("SubagentStop", "", "scripts/subagent-stop.sh", "local", { entryIndex: 5 }),
  ];

  const accountData = {
    profile: {
      signedIn: true,
      displayName: "Alex Rivera",
      email: "alex@example.dev",
      subscriptionType: "max",
      rateLimitTier: "20x",
      tokenExpiresAt: now + 27 * day,
      configCorrupted: false,
    },
    savedProfiles: [], activeProfileSlug: "alex",
    activeModel: "Opus 5",
    availableModels: [
      { alias: "opus", family: "opus", label: "Opus 5", id: "claude-opus-5", isLatest: true },
      { alias: "sonnet", family: "sonnet", label: "Sonnet 5", id: "claude-sonnet-5", isLatest: true },
      { alias: "haiku", family: "haiku", label: "Haiku 4.5", id: "claude-haiku-4-5", isLatest: true },
    ],
    settings: { model: "claude-opus-5", defaultMode: "default", effortLevel: "high", outputStyle: "default", additionalDirectories: ["~/scratch"], attribution: {} },
    permissions: [
      { scope: "global", allow: ["Bash(git status:*)", "Bash(pnpm test:*)", "Read(src/**)", "mcp__github__*", "Bash(gh pr view:*)"], deny: ["Bash(rm -rf:*)", "Bash(git push --force:*)"] },
      { scope: "project", allow: ["Bash(pnpm run build:*)"], deny: [] },
    ],
    settingsSnapshots: [
      { id: "s1", scope: "global", takenAtMs: now - hr, sizeBytes: 2480, path: "/s/1.json", changedKeys: ["model", "effortLevel"] },
      { id: "s2", scope: "global", takenAtMs: now - day, sizeBytes: 2411, path: "/s/2.json", changedKeys: [] },
    ],
    usage: {
      // Field names must match DailyActivity / DailyTokens exactly. They did
      // not — the fixture wrote `sessions` / `messages` / `tokens`, so the
      // view summed nothing and the published screenshot showed "0 tokens,
      // 0 sessions, 0 messages" under an empty heatmap.
      daily: Array.from({ length: 120 }, (_, i) => {
        // A plausible working rhythm: busier midweek, quieter weekends, and
        // ramping up over the period so the heatmap reads as real activity.
        const day = new Date(now - (119 - i) * day_);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const base = weekend ? 0.25 : 1;
        const ramp = 0.45 + i / 150;
        const messageCount = Math.round((14 + ((i * 7) % 23)) * base * ramp);
        return {
          date: day.toISOString().slice(0, 10),
          messageCount,
          sessionCount: Math.max(1, Math.round(messageCount / 9)),
          toolCallCount: messageCount * 6,
        };
      }),
      dailyTokens: [],
      dailyOwnTokens: Array.from({ length: 120 }, (_, i) => {
        const day = new Date(now - (119 - i) * day_);
        const weekend = day.getDay() === 0 || day.getDay() === 6;
        const base = weekend ? 0.3 : 1;
        return {
          date: day.toISOString().slice(0, 10),
          total: Math.round((90000 + ((i * 9973) % 240000)) * base * (0.5 + i / 170)),
        };
      }),
      activeDays: 96,
      totalDays: 120,
      mostActiveDay: "Wednesday",
      lastComputedDate: new Date(now).toISOString().slice(0, 10),
      byModel: [
        { model: "claude-opus-5", totalTokens: 9_900_000, costUsd: 78.2, sessions: 96 },
        { model: "claude-sonnet-5", totalTokens: 5_700_000, costUsd: 41.1, sessions: 74 },
        { model: "claude-haiku-4-5", totalTokens: 2_800_000, costUsd: 23.3, sessions: 44 },
      ],
      byProject: [
        { project: "/Users/alex/acme-billing", tokens: 9_200_000, sessions: 120, messages: 2100 },
        { project: "/Users/alex/acme-web", tokens: 4_100_000, sessions: 48, messages: 900 },
        { project: "/Users/alex/acme-infra", tokens: 2_800_000, sessions: 30, messages: 600 },
        { project: "/Users/alex/dotfiles", tokens: 1_100_000, sessions: 16, messages: 381 },
      ],
      byTool: [
        { name: "Bash", count: 1840 }, { name: "Read", count: 1502 }, { name: "Edit", count: 980 },
        { name: "Grep", count: 612 }, { name: "Write", count: 388 }, { name: "mcp__github__create_pr", count: 91 },
      ],
      byMcpServer: [{ server: "github", tools: 12, calls: 190 }],
      totalInputTokens: 7_900_000,
      totalOutputTokens: 10_500_000,
      totalOwnTokens: 18_400_000,
      totalCostUsd: 142.6,
      pricesEffectiveDate: "2026-09-01",
      currentStreak: 12, longestStreak: 19, longestSessionMs: 7.2e6, favoriteModel: "claude-opus-5",
      totalTokens: 18_400_000, totalSessions: 214, totalMessages: 3981, totalCost: 142.6,
      totalCacheReadTokens: 51_200_000, totalCacheCreationTokens: 3_100_000, totalDurationMs: 400 * hr,
    },
    usageWarming: false,
    quota: {
      fetchedAt: now - 60000,
      windows: [
        { key: "five_hour", label: "5-hour window", utilization: 62, resetsAt: now + 3.6e6 },
        { key: "seven_day", label: "Weekly (all models)", utilization: 88, resetsAt: now + 3 * day },
        { key: "seven_day_opus", label: "Weekly (Opus)", utilization: 41, resetsAt: now + 3 * day },
      ],
    },
  };

  const REPLIES = {
    ready: () => [
      { type: "settings", defaultFilter: "recent", defaultProject: "current", restoreCount: 4, density: "comfortable", claudeCodeExtensionInstalled: true, marketplaceSkillsUrl: "https://x", marketplaceMcpUrl: "https://mcp.so", demoSeen: true },
      { type: "workspacePath", data: "/Users/alex/acme-billing" },
      { type: "workspaceBranch", data: "main" },
      { type: "sessions", data: [{ label: "All", sessions }] },
      { type: "userState", pinned: ["c"], deleted: [], renames: {} },
    ],
    getSkills: () => [{ type: "skills", data: skills }],
    getCommands: () => [{ type: "commands", data: commands }],
    getAgents: () => [{ type: "agents", data: agents }],
    getMcpServers: () => [{ type: "mcpServers", data: mcpServers }],
    getHooks: () => [{ type: "hooks", data: hooks }],
    getAccountData: () => [{ type: "accountData", data: accountData }],
    // The quota card asks separately and sits on "Reading quota…" until this
    // lands, which is not a state worth photographing.
    fetchQuota: () => [{ type: "quotaData", result: { ok: true, data: {
      quota: {
        fiveHour: { utilization: 62, resetsAt: new Date(now + 3.6e6).toISOString() },
        sevenDay: { utilization: 41, resetsAt: new Date(now + 3 * day).toISOString() },
        capturedAt: new Date(now - 60000).toISOString(),
        fetchedAt: new Date(now).toISOString(),
      },
      live: {
        model: "Opus 5", contextUsedPercent: 34, contextSize: 1000000,
        sessionCostUsd: 1.84, linesAdded: 412, linesRemoved: 168,
        version: "2.1.86", capturedAt: new Date(now - 60000).toISOString(),
        promptCache: null,
      },
    } } }],
    getSessionDetail: (m) => [{ type: "sessionDetail", data: {
      ...sessions.find((s) => s.id === m.sessionId),
      totalMessages: 38, totalToolUses: 346, detailMode: "last",
      totalTokens: 412000, inputTokens: 210000, outputTokens: 202000,
      messages: [
        { role: "user", content: "Add exponential backoff to the webhook retries and cap it at six attempts, so a failing endpoint stops hammering the queue.", timestamp: new Date(now - 72 * min).toISOString() },
        { role: "assistant", content: "The retry already runs through the queue worker, so the backoff belongs there rather than in the webhook handler. I will add the schedule and leave the payload shape untouched.", timestamp: new Date(now - 70 * min).toISOString(), usage: { input: 12000, output: 900, cacheRead: 44000, cacheCreation: 1200 } },
        { role: "user", content: "good, do it", timestamp: new Date(now - 40 * min).toISOString() },
      ],
    } }],
  };

  const send = (msg) => window.postMessage(msg, "*");

  window.acquireVsCodeApi = () => ({
    postMessage(msg) {
      const make = REPLIES[msg && msg.type];
      setTimeout(() => {
        if (make) for (const r of make(msg)) send(r);
        send({ type: "ack" });
      }, 0);
    },
    getState: () => window.__state,
    setState: (s) => { window.__state = s; },
  });
})();
