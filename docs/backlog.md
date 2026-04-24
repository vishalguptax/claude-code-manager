# Claude Manager — Feature Backlog

Ranked roughly by impact. Each entry is a scope briefing — paste the section into a fresh Claude Code session to build the feature.

---

## 1. Self-computed usage stats from raw JSONL

**Why**: `stats-cache.json` numbers don't match Claude CLI's `/stats` output and the aggregation formula isn't documented. Ground-truth totals that don't drift with CLI releases.

**Scope**: full prompt at `docs/prompts/usage-from-jsonl.md`. Walks `~/.claude/projects/<slug>/*.jsonl`, aggregates per-day + per-model, caches per-file deltas keyed on mtime + size. Replaces `parseUsage()`.

**Surface**: Account tab → Usage section. Same shape (`UsageStats`), updated disclaimer.

---

## 2. Cost tracking per session + per project

**Why**: Users ask "how much did Claude cost me this week?" The answer exists (tokens × model pricing) but we don't compute it.

**Scope**:
- Maintain a static pricing table: `src/core/pricing.ts` mapping model ID → input / output / cache-read / cache-write rates (USD per million tokens). Update on Anthropic price changes (rare).
- Extend the usage walker (builds on #1) to accumulate cost alongside tokens per day, per model, per project.
- `UsageStats` gains `totalCostUsd`, `byProject: Array<{ projectKey, totalCostUsd, totalTokens }>`, `dailyCost: DailyCost[]`.
- Account tab Usage section: add cost totals next to token totals (locale-aware via existing `formatMoney`).
- Sessions tab: optional cost column per session in list view (feature-flag or setting).

**Pricing source**: https://www.anthropic.com/pricing — hardcode table, add a "prices effective: <date>" note so users know it's a snapshot.

**Out of scope**: per-token live-query to Anthropic billing API. Breaks local-first.

---

## 3. Hook management UI

**Why**: Hooks tab today is read-only — users must hand-edit `settings.json` to enable / disable / edit a hook. Editing JSON hooks by hand is error-prone (matcher regex, timeout defaults, command escaping).

**Scope**:
- Add enable / disable toggle per hook. When disabled, Claude Manager moves the hook entry into a `_disabled_hooks` sibling block (or prefixes its matcher with `##disabled##`); restored on re-enable.
- Inline editor for `command` + `timeout` + `matcher` with validation (shell-quoting warning, absolute-path existence check).
- "Add hook" wizard: pick event (`PreToolUse`, `PostToolUse`, `PreCompact`, …), matcher pattern helper, command input.
- Per-scope support: global / project / local, matching existing Permissions pattern.
- Delete hook with confirm modal.

**Surface**: Hooks tab (existing). Replace current read-only cards with editable rows.

---

## 4. Settings snapshot history

**Why**: `setSetting` writes are irreversible today. "I broke my Claude config, how do I go back?" has no answer short of `settings.json.bak-<epoch>` from Reset.

**Scope**:
- Before every `writeSettingsValue` mutation (sessions/viewProvider.ts), snapshot the current `settings.json` to `~/.claude/.claude-manager-snapshots/settings-<epoch>.json`.
- Keep last N (default 20); rolling delete oldest.
- Config tab section: "Settings history" — lists snapshots with timestamp + diff preview (which keys changed), Restore button per entry.
- Restore = replace live `settings.json` with selected snapshot after confirm modal.
- Respect scope: separate histories for global / project / local.

**Surface**: Config tab, collapsible section at bottom.

---

## 5. Bulk session operations

**Why**: Users with hundreds of sessions can't mass-prune / mass-pin. Current list supports one-at-a-time only.

**Scope**:
- Add checkbox multi-select to session list items. Show a floating toolbar when ≥1 selected: Pin / Unpin / Export / Delete.
- Keyboard: Shift+Click for range select, Ctrl+A for select-all-visible.
- Modal confirm for Delete with count ("Delete 14 sessions?") — irreversible so explicit.
- Export N sessions = zip of `.jsonl` files with manifest.

**Surface**: Sessions tab. Preserve current single-click → open detail UX; multi-select mode activates on first checkbox tap.

---

## 6. Extension self-diagnostic

**Why**: "Why doesn't X work on my machine?" — users open issues that would be answered by a pre-flight check.

**Scope**:
- Command palette entry `Claude Manager: Run diagnostics`.
- Modal list with pass/fail rows:
  - Claude CLI installed + version detected
  - `~/.claude/` readable
  - `~/.claude.json` parses, has `oauthAccount`
  - `~/.claude/.credentials.json` parses, token not expired
  - `stats-cache.json` mtime within 7 days
  - Each hook command's absolute path exists
  - Each additional-directory exists + readable
  - VS Code version meets minimum
  - Workspace detected (if needed)
  - GrowthBook / marketplace connectivity (if applicable)
- Failing rows include a Fix button when actionable (e.g. "Run `claude` once" for token refresh).

**Surface**: Command palette + Config tab "Diagnostics" button.

---

## 7. Prompt library

**Why**: Commands tab = slash commands only. Free-form reusable prompts ("Review this PR for security issues", "Summarize this meeting transcript") have no home today.

**Scope**:
- New storage: `~/.claude/manager-prompts/<id>.md` — frontmatter (title, tags, scope) + prompt body.
- Workspace variant: `<ws>/.claude/prompts/*.md`.
- New tab? Or extend Commands tab with a "Prompts" sub-section? Decide early — adding a tab requires webview shell changes.
- CRUD: list, preview, edit, delete, tag, search.
- "Launch in Chat" / "Copy" / "Insert as slash command" actions per prompt.
- Export to brain bundle (include in `.claudebrain.zip`).

**Surface**: New tab OR Commands tab sub-section. Lean toward new tab `Prompts` (icon: bookmark/message-square).

---

## 8. Skill + MCP marketplace — external links only

**Why**: Users want to discover community skills + MCP servers. Building an in-app marketplace is out of scope (moderation, hosting). External links solve the discovery problem cheaply.

**Scope**:
- Skills tab: add "Browse community skills" button in empty state + header. Opens a curated external URL (e.g. https://github.com/anthropics/claude-code/wiki/Skills or an Anthropic-maintained list) via `sendOpenUrl`.
- MCP tab: same pattern — "Browse MCP servers" button → https://mcp.so or the MCP registry URL.
- Both links configurable via `claudeManager.marketplaceSkillsUrl` and `claudeManager.marketplaceMcpUrl` so URLs can be updated without a release.
- NO in-app listing, preview, or install. Hands off.

**Surface**: Skills tab header; MCP tab header.

---

## 9. Session-to-PR draft generator — NEEDS CLARIFICATION

**Why**: In theory, a productive Claude Code session produces a chunk of work that becomes a PR. Today the user has to write the PR description manually after the session.

**Open questions — answer before specifying scope**:
- Input: which session slices become the PR body? Last N messages? Full transcript?
- Output: markdown blob copied to clipboard? Native GitHub PR via `gh`? VS Code SCM description field?
- Summarisation: require a round-trip to Claude API (violates local-first) or raw transcript paste?
- Scope: one repo, multi-file diff across branches?
- Is this meaningfully different from just asking Claude "write a PR description for this session"?

**Recommendation before building**: pick 1-2 concrete target workflows ("generate PR body from my most recent session's user prompts" OR "extract file changes into a PR template") and validate with 2-3 users. Until then, defer.

---

## 10. Reload / refresh extension

**Why**: No in-app way to force a re-parse + fresh webview state. Today users have to run `Developer: Reload Window` (heavy) or restart VS Code. After manual `~/.claude/` edits, the sidebar is stale until the next file-watcher tick.

**Scope**:
- Command palette: `Claude Manager: Reload`.
- Button in each tab header (small refresh icon), or a single button in the webview shell.
- Behavior:
  - Cancel any in-flight debounce timers (accountReparse, sessionsReparse).
  - Re-run `parseSessions`, `parseAccountData`, `parseSkills`, `parseCommands`, `parseHooks`, `parseMcpServers`, `parseAgents`.
  - Post fresh data to all tabs.
  - Clear quota cache if stale beyond TTL.
  - Do NOT recreate the webview (keep tab state + scroll).
- Keyboard shortcut: optional (e.g. `Ctrl+Alt+R` while sidebar focused).

**Surface**: Command palette + small refresh icon per tab header (non-intrusive) OR single global refresh button in the webview toolbar.

---

## Explicitly NOT doing

- Cloud sync of sessions / profiles / settings — breaks 100%-local promise.
- Anonymous telemetry — explicit non-goal.
- AI-generated session summaries requiring API call — network dependency.
- In-app marketplace for skills / MCP / commands — out of scope; rely on external links (#8).
- Match Claude CLI `/stats` formula exactly — drift-prone; self-compute instead (#1).
