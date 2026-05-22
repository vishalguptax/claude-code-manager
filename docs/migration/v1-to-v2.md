# Migrating from Claude Manager v1.x to v2.0

**Short version: there is nothing to do.** v2.0 is an internal rewrite — the
webview moved to Preact and every host↔webview message is now validated at
runtime — but the public surface is unchanged. Update the extension and keep
working.

## What does NOT change

### Settings keys (`claudeManager.*`)

All v1 settings keys are preserved verbatim. Your existing `settings.json`
keeps working with no edits:

| Setting | Status |
| --- | --- |
| `claudeManager.terminal.location` | unchanged |
| `claudeManager.terminal.editorPosition` | unchanged |
| `claudeManager.sessions.defaultFilter` | unchanged |
| `claudeManager.sessions.defaultProject` | unchanged |
| `claudeManager.sessions.restoreWindowMinutes` | unchanged |
| `claudeManager.sessions.resumeIn` | unchanged |
| `claudeManager.marketplaceSkillsUrl` | unchanged |
| `claudeManager.marketplaceMcpUrl` | unchanged |

### Command IDs

Every command keeps its ID, so keybindings and any automation referencing them
continue to work:

`claudeManager.open`, `claudeManager.switchAccount`, `claudeManager.reload`,
`claudeManager.exportBrain`, `claudeManager.importBrain`,
`claudeManager.runDiagnostics`.

Default keybindings are unchanged (`Ctrl/Cmd+Alt+C` to open,
`Ctrl/Cmd+Alt+R` to reload while the view is focused).

### View / container IDs

`claudeCodeManager` (activity-bar container) and `claudeCodeManager.view`
(the webview) are unchanged. Any "move view" layout customisation you made
survives the upgrade.

### Data on disk

Claude Manager still reads `~/.claude/` and your workspace `.claude/` exactly
as before. It never migrates, rewrites, or moves your sessions, skills,
commands, hooks, agents, MCP config, or settings. Pinned/renamed/hidden session
state (kept in the extension's `globalState`) carries over untouched.

### The promise

Still 100% local. Still zero telemetry, zero analytics, zero accounts. The only
network call remains the **opt-in** account quota fetch you explicitly trigger
from the Account tab — nothing is sent automatically.

## What changes (and is visible)

- **Minimum VS Code is now `1.90.0`** (was `1.85.0`). If you run an editor
  older than ~18 months, stay on v1.10.x until you can update. This is the one
  upgrade that can block install.
- **Session list date-group headers** and **persisted filter/collapse state**
  are session-scoped in 2.0 (they reset on a full reload). The virtualized list
  needs uniform rows; per-feature persistence is staged for a follow-up.
  Pinned-first ordering is preserved.
- **The cinematic first-run intro** from v1 is gone.

Everything else — the tabs, the actions, the layout — looks and behaves as it
did in v1.

## Rollback

v2 changes no on-disk data, so rolling back is safe and lossless:

1. In the Extensions view, click the gear on **Claude Manager** →
   **Install Another Version…**
2. Pick the latest **1.10.x** build.
3. Reload the window.

Your sessions, settings, and pinned/renamed state are read from the same files
v1 used, so they reappear immediately. (The v1.x line stays installable on the
Marketplace and Open VSX as a rollback target.)

## Reporting a regression

If something that worked in v1 misbehaves in v2, run **Claude Manager: Run
Diagnostics** from the Command Palette and attach the (redacted) report to a
[bug report](https://github.com/vishalguptax/claude-code-manager/issues/new?template=bug.yml).
