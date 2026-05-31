# Changelog

## [2.0.0] - 2026-06-01

Ground-up rebuild of the webview on Preact + signals with a valibot-validated
message protocol. Migration only — every feature, setting, command, and the
"100% local, zero telemetry" promise are preserved. See
[docs/releases/v2.0.0.md](docs/releases/v2.0.0.md) and the
[v1→v2 migration guide](docs/migration/v1-to-v2.md). Iterated through
`2.0.0-beta.1` and `2.0.0-beta.2`.

### Added in 2.0.0 (after beta.1)

- Active sessions group: live CLIs pinned above date buckets with status-aware
  dots (idle/busy/awaiting-question), de-duped against Pinned.
- **View** action: when a session is already hosted in a VS Code terminal, the
  Resume button swaps to View and focuses that terminal instead of spawning a
  duplicate. Detection works for any launch path — `claude --resume`, bare
  `claude`, `--continue`, fork, or external — via a passive `SessionStart`
  hook (auto-installed in `~/.claude/settings.json`) plus a shell-integration
  tap on `onDidStartTerminalShellExecution`.
- Current-project + current-branch markers in the filter dropdowns, pinned to
  the top of their respective lists.
- Self-healing statusline tap: re-installs silently when a project / local
  `settings.json` reverts wipe the wiring.
- Account Usage section redesign: donut + bars + pills + info ribbon, version-
  tinted colors, recency-sorted model breakdown.
- Auth-health banner for MCP connectors that need re-authentication.
- Global full-reload button (toolbar ghost): clears every cache, re-parses,
  re-mounts the webview.

### Fixed in 2.0.0 (after beta.1)

- Session token total now reads input + output only (cache_read inflated the
  number O(N²) on long sessions; cache stats moved to the tooltip).
- Account, Config, and Sessions skeletons fill the full panel height on a tall
  sidebar instead of leaving a blank gap below the last placeholder section.
- ActionsBar weights flattened so the toolbar reads as one flat rhythm
  regardless of button count.
- Restore-window, default filter, and default project settings are honored
  again (the v1 sessions settings handler was dropped in v2).

### Added

- Preact-based webview for all tabs with reactive `@preact/signals` state.
- Shared, valibot-validated postMessage protocol (`src/shared/protocol`) parsed
  on both the host and webview sides.
- Code-split webview: tiny shell plus a lazy-loaded chunk per feature.
- Windowed `<VirtualList />` so 5,000+ sessions (and any large feature list)
  scroll in constant time.
- `@vscode/test-electron` integration smoke suite (run under xvfb in CI).
- Performance harness (`scripts/perf/`) with a configurable N-session fixture.
- CodeQL workflow, PR template, and bug/feature issue forms.

### Changed

- Build toolchain: Biome replaces ESLint + Prettier; size-limit gates bundles.
- Sessions host code decomposed (view provider + parser split into focused
  modules); search index gained LRU eviction.
- Account usage/heatmap/formatting extracted into pure, unit-tested modules.
- Minimum VS Code bumped to `^1.90.0`; Node engine `>=20`.

### Removed

- Legacy vanilla DOM webview, the v1 compat shims, and dead webview modules
  (demo intro, marketplace/uiReset/loader/icons/select helpers).
- The v1 cinematic first-run intro.

### Security

- Git ref validation before any `claude --resume` shell invocation (resume /
  fork / restore-workspace), closing a shell-injection vector.
- CSP hardened to `default-src 'none'`, nonce-only module scripts,
  `connect-src 'none'`.

## [1.10.0] - 2026-05-19

Installed Claude Code plugins now surface their skills, agents, slash commands, hooks, and MCP servers alongside their user-level counterparts, and sessions waiting on `AskUserQuestion` / `ExitPlanMode` get a distinct orange live indicator so idle "needs your input" sessions stop hiding behind the green dot.

See [docs/releases/v1.10.0.md](docs/releases/v1.10.0.md) for full details.

## [1.9.0] - 2026-05-12

Usage analytics overhauled with per-project / per-tool / MCP-server breakdowns and JSONL-primary aggregation that keeps history past the CLI's stats-cache cutoff. New ephemeral "Temp" session button launches Claude with full skills/agents/hooks but wipes the transcript on terminal close.

See [docs/releases/v1.9.0.md](docs/releases/v1.9.0.md) for full details.

## [1.8.0] - 2026-05-08

Account profile switching now survives Claude CLI's token-rotation lifecycle, sessions pick up the CLI-generated topic title, and usage stats fill in days the stats cache hasn't caught up to yet.

See [docs/releases/v1.8.0.md](docs/releases/v1.8.0.md) for full details.

## [1.7.3] - 2026-05-06

Session export now works reliably across every platform — including Cursor + WSL — by routing file lookups through the parser's authoritative on-disk index instead of reconstructing paths from cwd metadata.

See [docs/releases/v1.7.3.md](docs/releases/v1.7.3.md) for full details.

## [1.7.2] - 2026-04-27

Two reliability fixes — the model dropdown now finds Claude CLI no matter how it was installed, and the cinematic intro stays dismissed for good.

See [docs/releases/v1.7.2.md](docs/releases/v1.7.2.md) for full details.

## [1.7.1] - 2026-04-27

Performance overhaul across all parsers (mtime-cached disk reads, smart watcher, parallel reload), keyed DOM diff for the session list, panel loaders for cold start, plus two crash fixes: Brain export under an open workspace and the Save-Profile button against Anthropic's opaque access tokens.

See [docs/releases/v1.7.1.md](docs/releases/v1.7.1.md) for full details.

## [1.7.0] - 2026-04-26

Backlog batch — eight new capabilities land in one release: full hook CRUD, bulk session ops, cost estimates, settings rollback, self-diagnostic, reload command, marketplace links, and tighter usage stats.

See [docs/releases/v1.7.0.md](docs/releases/v1.7.0.md) for full details.

## [1.6.0] - 2026-04-24

New Config tab, Brain backup / restore, and a rewrite of the multi-account switcher so `/login` no longer replaces saved accounts.

See [docs/releases/v1.6.0.md](docs/releases/v1.6.0.md) for full details.

## [1.5.2] - 2026-04-22

Repairs the multi-account switcher: identity survives Claude CLI's background token rotation, switching preserves your project history + migration flags, and the two-file swap is crash-safe with rollback.

See [docs/releases/v1.5.2.md](docs/releases/v1.5.2.md) for full details.

## [1.5.1] - 2026-04-21

Detail-view transcript search feels native now (focus + caret survive every keystroke), plus a new demo GIF headlines the marketplace listing.

See [docs/releases/v1.5.1.md](docs/releases/v1.5.1.md) for full details.

## [1.5.0] - 2026-04-21

Major account + detail-view overhaul: multi-account switcher, opt-in subscription quota card, full-transcript search, per-message token + tool insight, and deep Claude Code extension integration.

See [docs/releases/v1.5.0.md](docs/releases/v1.5.0.md) for full details.

## [1.4.0] - 2026-04-19

Full-text session search, a proper branch-filter dropdown, and an account tab overhaul — the largest sessions pass since import/export.

See [docs/releases/v1.4.0.md](docs/releases/v1.4.0.md) for full details.

## [1.3.2] - 2026-04-15

README updated with v1.3 features and GitHub Sponsors enabled.

See [docs/releases/v1.3.2.md](docs/releases/v1.3.2.md) for full details.

## [1.3.1] - 2026-04-14

Layout fixes for action button rows across every detail view, a new Continue toolbar button, and a fix for Restore Workspace opening terminals in separate panels.

See [docs/releases/v1.3.1.md](docs/releases/v1.3.1.md) for full details.

## [1.3.0] - 2026-04-14

Cross-machine session import/export, a deep audit of session-list bugs and edge cases, and a polish pass over the Account tab.

See [docs/releases/v1.3.0.md](docs/releases/v1.3.0.md) for full details.

## [1.2.3] - 2026-04-13

Shrinks the packaged extension from 5.6 MB back to ~590 KB by compressing an oversized retina screenshot.

See [docs/releases/v1.2.3.md](docs/releases/v1.2.3.md) for full details.

## [1.2.2] - 2026-04-13

Fixes the retired shields.io Marketplace badges that rendered as "RETIRED BADGE" on the extension listing.

See [docs/releases/v1.2.2.md](docs/releases/v1.2.2.md) for full details.

## [1.2.1] - 2026-04-13

Smarter terminal handling (reuse + tab stacking + Windows path fix), a license switch to Apache 2.0, and a marketplace-facing README overhaul.

See [docs/releases/v1.2.1.md](docs/releases/v1.2.1.md) for full details.

## [1.2.0] - 2026-04-13

New **Account tab** with profile, usage heatmap, and permissions management — plus real-time session sync, relative timestamps, a sweeping UI polish pass, and an automated release pipeline with curated notes.

See [docs/releases/v1.2.0.md](docs/releases/v1.2.0.md) for full details.
