# Changelog

## [1.11.3] - 2026-05-28

MCP tab now badges connectors that Claude Code has flagged as needing (re-)authentication — sourced from `~/.claude/mcp-needs-auth-cache.json`. Pure local read, no network. See [docs/releases/v1.11.3.md](docs/releases/v1.11.3.md).

## [1.11.2] - 2026-05-28

Scope-aware statusline install + live cache watcher. The 1.11.0 install only wrote at global scope, so any repo with its own `.claude/settings.json` statusline silently shadowed our tap. Now the installer detects which scope Claude actually reads (local › project › global) and writes there; uninstall reverses at the same scope. The Quota + Current Session cards now auto-refresh the instant Claude re-renders. Plus an absolute-node-path resolve at install time so nvm setups work, and a clearer label when a cached window has rolled over.

See [docs/releases/v1.11.2.md](docs/releases/v1.11.2.md) for full details.

## [1.11.0] - 2026-05-28

Quota is now read entirely locally. Earlier versions sent your subscription OAuth token to `api.anthropic.com` from outside Claude Code — prohibited under Anthropic's 2026 terms and a risk to your account. An opt-in statusline tap lets Claude Code cache the 5h / 7d figures locally and the panel reads that file: no network call, no token. A new Current session card shows live model, context usage, and session cost from the same cache.

See [docs/releases/v1.11.0.md](docs/releases/v1.11.0.md) for full details.

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
