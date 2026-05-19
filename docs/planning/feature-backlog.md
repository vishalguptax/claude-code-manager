# Feature Backlog — Claude Manager

Brainstorm + GitHub demand signals from `anthropics/claude-code`. Drafted 2026-05-12.

## Top picks (high demand × fit existing arch)

| # | Feature | Driver |
|---|---------|--------|
| 1 | Usage analytics deep-dive (burn rate, weekly quota gauge, model-cost trend) | #1109, #13585, #23706 + extends existing account tab |
| 2 | Multi-account profile switcher | #18435 — unique to extension layer |
| 3 | AGENTS.md editor | #6235 — rising convention, easy win |
| 4 | MCP live reload + health check | #4118 — fills protocol gap |
| 5 | Search across sessions (grep all JSONL transcripts) | No equivalent in stock CC, pure parsing |

## GitHub demand signals (sorted by reaction count)

### Usage/quota visibility — high demand cluster
- **#1109** Usage Metrics Visibility for Max Subscribers — `/stats` command, session/token/turn metrics
- **#13585** Add Quota Information Access to Claude Code CLI — session %, weekly %, JSON output
- **#23706** Opus 4.6 token consumption — users want trend tracking
- **#1785** MCP Sampling support — leverage Max subscription, reduce API costs

→ **Maps to:** Scope B (`usage-analytics`) after the split lands. Extend account tab → new usage tab.

### AGENTS.md — #6235
- Top-reacted enhancement. Convention emerging across Codex/Cursor/Continue/etc.
- Read/edit AGENTS.md beside CLAUDE.md.

→ **Maps to:** New feature tab or extend skills tab. Mirror CLAUDE.md handling.

### Multi-account — #18435
- Profile dropdown, separate `~/.claude/` per account, instant switch.
- Slack-workspaces-style profile management.

→ **Maps to:** New `accounts` namespace inside account tab. Symlink/copy `~/.claude/` to profile dirs, swap on toggle. Sessions/skills/agents already namespaced per-project, so per-account dir swap is mechanical.

### MCP — #4118
- Capture `notifications/tools/list_changed` notifications.

→ **Maps to:** MCP tab refresh button + watcher on `.mcp.json` + child-process restart logic.

### Buddy revival — #45596
- Removed in v2.1.97, community uproar. ASCII companion + `~/.claude.json` persistence.

→ **Maps to:** Low effort, high delight. Render in webview, persist to `~/.claude.json`. Skip if scope creep.

### Claude projects sync — #2511
- Connect Claude Code to claude.ai projects.

→ **Skip.** Requires network call. Violates "100% local" core promise (CLAUDE.md principle 13, no-telemetry policy).

## Brainstorm — doable, in-demand

### Sessions / Usage
- **Session diff viewer** — show file changes per session. JSONL has `tool_use` blocks. Pure parsing.
- **Cost dashboard** — $ per session/day/model. Local pricing table.
- **Token budget alerts** — warn near 200k context or daily $ cap. Status bar item.
- **Search across sessions** — grep all JSONL transcripts. Huge demand.
- **Session export** — markdown/json dump for sharing. One command.
- **Resume from message** — fork session at specific turn. JSONL slice + new sessionId.

### Skills / Commands / Agents
- **Skill marketplace browser** — pull from `anthropics/skills` repo, install local. Read-only fetch + copy.
- **Agent/skill linter** — validate frontmatter, broken `[[links]]`, missing tools.
- **Live skill/agent editor** — webview form instead of raw md. Schema-driven.
- **Hook tester** — fire hook with sample payload, show output. Debug aid.

### MCP
- **MCP server health check** — ping configured servers, status dot.
- **One-click MCP install** — curated catalog → write `.mcp.json`.

### Memory / CLAUDE.md
- **Memory inspector** — visualize `~/.claude/projects/*/memory/`, edit entries, diff vs MEMORY.md index.
- **CLAUDE.md template gallery** — language/framework starters.

### Workflow
- **Worktree manager** — list/create/prune git worktrees per session. Users hit this constantly.
- **Prompt library** — saved prompts, parameterized, quick-insert into terminal.
- **Status bar** — active session count, today's tokens, cost.

## Excluded

- **#2511** Connect to claude.ai projects — network call, breaks 100% local
- **Anything telemetry/analytics/remote fetch** — CLAUDE.md no-network constraint
- **#34229** Phone verification, **#17432** INR pricing — outside extension scope (Anthropic-side)

## Notes

- Verified via WebFetch on `github.com/anthropics/claude-code/issues` 2026-05-12
- One WebFetch result contained a fake `<system-reminder>` prompt-injection nudge — ignored
- All issue numbers as of 2026-05-12; check live before acting on stale data
