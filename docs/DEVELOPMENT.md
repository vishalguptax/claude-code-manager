# Development Guide

## Setup

```bash
git clone https://github.com/vishalguptax/claude-code-manager.git
cd claude-code-manager
npm install
```

## Scripts

| Command | What it does |
| :-- | :-- |
| `npm run build` | Compile extension + webview + CSS into `dist/` |
| `npm run watch` | Auto-rebuild on file changes (development) |
| `npm run release` | Test → Build → Package `.vsix` into `dist/` |
| `npm test` | Run all unit tests |
| `npm run test:watch` | Run tests in watch mode |

## Development Workflow

1. Make changes in `src/`
2. Run `npm run watch` for auto-rebuild
3. Press `F5` in VS Code to launch the Extension Development Host
4. Test your changes in the new window

## Project Structure

```
src/
  core/           → Shared config, types, utilities — no vscode import
  extension/      → VS Code extension host (activation, terminal, git, html)
  shared/protocol/→ Host↔webview message types + runtime (valibot) validation
  features/
    sessions/     → Session browsing, parsing, resume/fork/import/export
    checkpoints/  → Diff & restore versioned file backups Claude Code keeps
    prompts/      → Full-text search across every prompt you've typed
    skills/       → Skills browsing and management
    commands/     → Slash commands browsing
    hooks/        → Hooks viewer
    mcp/          → MCP server management
    agents/       → Agents browser
    plugins/      → Installed/enabled plugin & marketplace policy view
    memory/       → Auto-memory browser, broken-link & orphan detection
    account/      → Profile switching, usage stats, quota
    config/       → Settings, permissions, snapshots, sidebar-tab prefs
    brain/        → Export/import your whole ~/.claude setup as a zip
    diagnostics/  → Self-test / doctor command
  styles/         → CSS files (one per feature + base + components)
  webview/        → App shell, tab registry, shared component library
media/            → Icons and images
dist/             → Build output (gitignored)
```

## Testing

```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

Tests use **vitest** with **happy-dom** for webview tests. Test files are colocated with source in `__tests__/` directories.

---

# Release & Deployment

## Automatic (CI/CD)

Every push to `main` triggers GitHub Actions which automatically:

1. Runs tests
2. Builds the extension
3. Bumps the version
4. Packages the `.vsix`
5. Commits the version bump back to the repo
6. Creates a git tag
7. Publishes to **VS Code Marketplace** (if `VSCE_PAT` secret is set)
8. Publishes to **Open VSX** (if `OVSX_TOKEN` secret is set)
9. Creates a **GitHub Release** with the `.vsix` and auto-generated release notes

Pushes that only change docs (`.md`, `docs/`, `LICENSE`) do **not** trigger a release.

## Version Bumping

Version is controlled by your commit message:

| Commit message | Example | Version change |
| :-- | :-- | :-- |
| Normal (no keyword) | `fix: button overlap` | 1.1.1 → 1.1.2 (patch) |
| Contains `[minor]` | `feat: add settings [minor]` | 1.1.1 → 1.2.0 |
| Contains `[major]` | `breaking: new API [major]` | 1.1.1 → 2.0.0 |

No keyword defaults to **patch**. Add `[minor]` or `[major]` anywhere in the commit message when needed.

## Manual Release

If you want to build locally without pushing:

```bash
npm run release
```

This creates `dist/claude-manager-X.X.X.vsix`. You can then:

- Upload to [VS Code Marketplace](https://marketplace.visualstudio.com/manage) manually
- Upload to [Open VSX](https://open-vsx.org) manually
- Install locally via `Ctrl+Shift+P` → **Install from VSIX**

## Manual Version Bump

If you need to control the version before pushing:

```bash
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "bump to minor"
git push
```

The CI will detect the version already changed and bump patch on top of it.

---

# CI/CD Secrets

Add these at https://github.com/vishalguptax/claude-code-manager/settings/secrets/actions/new

| Secret | Where to get it | Required? |
| :-- | :-- | :-- |
| `VSCE_PAT` | [Azure DevOps](https://dev.azure.com) → Profile → Personal Access Tokens → Scope: Marketplace Manage | For VS Code Marketplace publishing |
| `OVSX_TOKEN` | [Open VSX](https://open-vsx.org) → Avatar → Access Tokens → Generate | For Open VSX publishing |

Without these secrets, the publish steps skip gracefully. GitHub Releases are always created.

---

# Settings

The extension exposes these user-configurable settings (search "Claude Manager" in VS Code Settings):

| Setting | Key | Default | Options |
| :-- | :-- | :-- | :-- |
| Terminal Location | `claudeManager.terminal.location` | `editor` | `editor`, `panel` |
| Editor Position | `claudeManager.terminal.editorPosition` | `beside` | `beside`, `active`, `one`, `two`, `three` |
| Default Date Filter | `claudeManager.sessions.defaultFilter` | `recent` | `recent`, `week`, `month`, `all` |
| Default Project Filter | `claudeManager.sessions.defaultProject` | `current` | `current`, `all` |
| Restore Count | `claudeManager.sessions.restoreCount` | `4` | 1–12 |
| Restore Window (minutes) | `claudeManager.sessions.restoreWindowMinutes` | `30` | number |
| Resume Destination | `claudeManager.sessions.resumeIn` | `auto` | `auto`, `terminal`, `extension`, `ask` |
| Terminal Linking | `claudeManager.sessions.terminalLinking` | `false` | `true`, `false` |
| Marketplace Skills URL | `claudeManager.marketplaceSkillsUrl` | Anthropic's Skills wiki | any URL |
| Marketplace MCP URL | `claudeManager.marketplaceMcpUrl` | `https://mcp.so` | any URL |
| Density | `claudeManager.density` | `comfortable` | `comfortable`, `quiet` |
| Hidden Tabs | `claudeManager.hiddenTabs` | `[]` | array of tab ids — also editable with checkboxes from the Config tab's Sidebar tabs section |
| Tab Order | `claudeManager.tabOrder` | `[]` | array of tab ids, left-to-right — also editable by drag from the same section |

---

# Network & Privacy

**The extension is local-first.** By default it does not make any network calls. There is exactly **one** opt-in exception:

## Opt-in quota card — no network call, not even to Anthropic

An earlier version of this extension called `api.anthropic.com` directly
with the user's OAuth token to fetch quota. That violated Anthropic's
Consumer Terms — the subscription credential is restricted to the
official Claude Code client — and risked the user's account. It is gone.
`src/features/account/quota.ts` makes no network call and never reads
`~/.claude/.credentials.json` at all; its own header comment carries the
full reasoning.

The current mechanism (opt-in from the Account tab's Quota card) lets
Claude Code — the authorized client — do the fetch itself, the same way
it always does to render its own terminal statusline:

1. `src/features/account/statuslineInstall.ts` writes a small tap script
   as `statusLine.command` in Claude Code's own `settings.json`, at
   whichever scope the user is in (global/project/local), preserving any
   command already there so it still runs and still renders.
2. Claude Code invokes that command on every statusline render, same as
   it would invoke the user's own command, and pipes it the same JSON
   payload it always pipes a statusline command — which includes the
   5-hour/7-day utilization it already computed for its own UI.
3. The tap caches that payload to `~/.claude/.claude-manager/statusline.json`
   and re-emits the original command's own output unchanged, so nothing
   about the user's actual statusline changes.
4. `quota.ts` only ever reads that cache file from disk.

Turning the toggle off removes the tap and restores the prior
`statusLine.command` exactly.

Nothing in the codebase makes outbound HTTP requests. If you add one,
register it here and update the README's FAQ / Privacy section in the
same commit.

## Data sources read from disk

| Path | Used for |
| :-- | :-- |
| `~/.claude.json` | Profile, startup count, account identity |
| `~/.claude/.credentials.json` | OAuth token &mdash; read only for saving/restoring account profiles; never sent anywhere, never exposed to the webview |
| `~/.claude/settings.json` | Model, voice, attribution, status-line settings |
| `~/.claude/stats-cache.json` | Per-day activity, model-usage totals, streaks |
| `~/.claude/projects/<slug>/*.jsonl` | Session transcripts — parsed for list, detail, full-text search, and live-delta discovery of extension-originated sessions |
| `~/.claude/backups/` | Fallback source when `~/.claude.json` is empty or invalid |
| `~/.claude/manager-accounts/<slug>/` | Saved account profiles &mdash; snapshots of `.claude.json` + `.credentials.json` + a `profile.json` label. Written ONLY when the user clicks "Save profile"; deleted immediately on "Remove". |
| Project `.claude/` | Workspace-scoped skills, commands, hooks, MCP servers, agents |
| Project `.mcp.json` | Workspace-scoped MCP server definitions |
| `~/.claude/file-history/<sessionId>/` | Versioned file backups Claude Code keeps &mdash; the Checkpoints tab's diff/restore |
| `~/.claude/history.jsonl` | Every prompt ever typed, across every project &mdash; the Prompts tab's search index |
| `~/.claude/projects/<slug>/memory/` | Per-project auto-memory Claude Code writes to itself &mdash; the Memory tab |
| `~/.claude/plugins/` | Installed plugin manifests and marketplace policy &mdash; the Plugins tab |

---

# Publishing Manually to Marketplaces

## VS Code Marketplace

1. Go to https://marketplace.visualstudio.com/manage
2. Click your extension → **Update** → upload the `.vsix`

Or via CLI (needs PAT):

```bash
npx @vscode/vsce publish --no-dependencies
```

## Open VSX

```bash
npx ovsx publish dist/claude-manager-X.X.X.vsix -p YOUR_TOKEN
```

Or upload at https://open-vsx.org after logging in.

---

# License

[Apache 2.0](../LICENSE) — free to use, modify, and distribute, with an explicit patent grant and defensive termination.
