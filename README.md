<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager" width="100">

<h1>Claude Manager</h1>

<p><strong>Every <a href="https://claude.ai/code">Claude Code</a> session, skill, slash command, hook, MCP server, and agent &mdash; one click away in your VS Code sidebar.</strong></p>

<p>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://vsmarketplacebadges.dev/version-short/vishalguptax.claude-manager.svg?style=for-the-badge&label=Marketplace&labelColor=1a1a2e&color=007ACC&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
<a href="https://open-vsx.org/extension/vishalguptax/claude-manager"><img src="https://img.shields.io/open-vsx/v/vishalguptax/claude-manager?style=for-the-badge&label=Open%20VSX&labelColor=1a1a2e&color=a60ee5&logo=eclipseide&logoColor=white" alt="Open VSX"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://vsmarketplacebadges.dev/installs-short/vishalguptax.claude-manager.svg?style=for-the-badge&label=Installs&labelColor=1a1a2e&color=22c55e&logo=visualstudiocode&logoColor=white" alt="Installs"></a>
<a href="https://github.com/vishalguptax/claude-code-manager/stargazers"><img src="https://img.shields.io/github/stars/vishalguptax/claude-code-manager?style=for-the-badge&label=Stars&labelColor=1a1a2e&color=f59e0b&logo=github&logoColor=white" alt="GitHub Stars"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-f43f5e?style=for-the-badge&labelColor=1a1a2e" alt="License"></a>
<a href="https://github.com/sponsors/vishalguptax"><img src="https://img.shields.io/badge/Sponsor-%E2%99%A5-ec4899?style=for-the-badge&labelColor=1a1a2e&logo=githubsponsors&logoColor=white" alt="Sponsor"></a>
</p>

</div>

<br>

<div align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/01-sessions.png" alt="Claude Manager sidebar showing pinned and recent Claude Code sessions with git branches" width="420">
</div>

<p align="center">
<sub>Local-first &bull; Zero telemetry &bull; Zero accounts &bull; Works in VS Code, Cursor, Windsurf, VSCodium, Codespaces, and Gitpod</sub>
</p>

<br>

## Install

**VS Code &bull; Cursor &bull; Windsurf** &mdash; open Extensions (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search **Claude Manager**, click Install.

**VSCodium &bull; Theia &bull; Gitpod** &mdash; install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

**Command line** &mdash; `code --install-extension vishalguptax.claude-manager`

Then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> on Mac) to open the panel. That's it.

<br>

## Why it exists

Claude Code is powerful, but the terminal isn't built for browsing. Finding a session you ran last week means scrollback hunting. Editing an MCP server means hand-patching JSON. Keeping track of every custom slash command, hook, and agent is its own job.

Claude Manager turns all of it into a sidebar you can click and search. Same Claude Code underneath &mdash; just one keystroke closer.

<br>

## What's inside

| | |
| :-- | :-- |
| **Sessions** | Resume, continue, restore, pin, rename, fork, import, export, and full-text search across every Claude Code session. Filter by project and git branch. Resume warns if your current branch doesn't match. Auto-routes Resume to the terminal or the Claude Code extension chat tab based on where the session originated (configurable). |
| **Skills** | Global and project skills with scope badges. Copy, open, delete, or launch Claude with a skill in one click &mdash; terminal or extension chat. |
| **Commands** | 52 built-in slash commands plus your custom ones from `.claude/commands/`. One-click copy or launch in Claude Code chat. |
| **Hooks** | Inspect automation hooks across global, project, and local scopes with full command preview. |
| **MCP Servers** | Enable, disable, delete, or inspect MCP servers &mdash; no JSON editing. API keys and secrets masked automatically. |
| **Agents** | Browse project agents with Sonnet / Opus / Haiku badges and description previews. |
| **Account** | Profile, **multi-account switcher** (save + swap between Claude logins without full `/logout`+`/login`), activity heatmap, token usage across 7-day / 30-day / all-time, model selector, permissions editor, and an opt-in **Quota** card showing your current 5-hour / 7-day subscription utilization. |
| **Status bar** | Open Claude Manager from anywhere in your editor with a single click. |

<table>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/02-skills.png" alt="Skills tab" width="360"><br>
<strong>Skills</strong><br>
<sub>Global and project skills with scope badges. Copy, open, delete, or launch Claude with a skill.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/03-commands.png" alt="Commands tab" width="360"><br>
<strong>Commands</strong><br>
<sub>52 built-in slash commands plus your custom ones from <code>.claude/commands/</code>. One-click copy.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/04-hooks.png" alt="Hooks tab" width="360"><br>
<strong>Hooks</strong><br>
<sub>Inspect automation hooks across global, project, and local scopes with full command preview.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/05-mcp.png" alt="MCP servers tab" width="360"><br>
<strong>MCP Servers</strong><br>
<sub>Enable/disable, delete, or inspect MCP servers. API keys and secrets masked automatically.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/06-agents.png" alt="Agents tab" width="360"><br>
<strong>Agents</strong><br>
<sub>Browse project agents with Sonnet / Opus / Haiku badges and description previews.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/07-account.png" alt="Account tab" width="360"><br>
<strong>Account</strong><br>
<sub>Profile, activity heatmap, token stats, and permissions &mdash; without leaving your editor.</sub>
</td>
</tr>
</table>

<br>

## Sessions, in depth

- **Smart grouping** &mdash; Today, This Week, This Month, Older
- **Relative timestamps** &mdash; `now`, `2m`, `4h`, `3d`, `1mo`, `1y`
- **Project + branch dropdowns** &mdash; narrow to a project, then to any branch that has sessions (current branch is labelled)
- **Date chips** &mdash; Recent, Week, Month, All
- **Full-text search** &mdash; matches inside every message, not just titles and metadata. Scales to thousands of sessions without blocking the UI
- **Pin** favorites &bull; **Rename** sessions &bull; **Fork** for alternate explorations
- **Resume** with branch detection &mdash; warns if your current branch differs. Auto-routes to the terminal or the Claude Code extension chat tab based on where the session originated (configurable via `claudeManager.sessions.resumeIn`)
- **Continue** &mdash; pick up your most recent session in the current workspace (`claude --continue`)
- **Restore Workspace** &mdash; reopen every terminal from your last working session, stacked as tabs in one editor group
- **Import / Export** &mdash; export any session as a portable `.jsonl`, import it on another machine with a project picker and one-click resume
- **Right-click menu** &mdash; pin, rename, fork, copy command, export session, delete
- **Extension sessions** &mdash; sessions started inside the official Claude Code VS Code extension appear in the list alongside CLI-started ones, even when `history.jsonl` doesn't record them

<br>

## Quota (opt-in)

The Account tab has a **Quota** card that shows your current subscription utilization &mdash; how much of the rolling 5-hour and 7-day windows you've consumed, with a reset timer.

- Click **Check quota** to fetch. The extension makes a single `GET https://api.anthropic.com/api/oauth/usage` request using the OAuth token in `~/.claude/.credentials.json`. The token stays on your machine; only the utilization percentages come back.
- Color-coded: green under 50%, amber 50&ndash;80%, red above 80%.
- No auto-polling. No background refresh. You decide when to fetch.
- Breaks down per-model (Opus / Sonnet) when your plan exposes those limits, and surfaces pay-as-you-go overflow if enabled.

If you never click the button, Claude Manager makes no network calls at all.

<br>

## Multi-account switcher

The Account tab's **Accounts** section lets you keep several Claude logins ready to go and swap between them without running through `/logout` + `/login` in the terminal each time.

**How it works**
- Click **Save current account** to snapshot your live `~/.claude.json` + `~/.claude/.credentials.json` into a labeled slot under `~/.claude/manager-accounts/<slug>/`.
- The card for the currently-active login is highlighted with an accent border and an **Active** pill.
- Click **Switch** on any saved card to overwrite the home-dir creds with that slot. A modal confirms before anything is written.
- After Claude CLI rotates the access token (roughly every 8 hours), click **Update** on the active card to re-snapshot. Each slot tracks its own expiry.

**Privacy**
Saved profiles duplicate your OAuth tokens on disk &mdash; same format, same plaintext as Claude CLI itself stores in `~/.claude/.credentials.json`. Treat `~/.claude/manager-accounts` as sensitive; delete slots you no longer need. The extension never transmits these tokens anywhere.

**Known limits**
- Close running Claude terminals before switching. In-flight tool calls may fail if the credentials change mid-task.
- Org-within-account switching works: `organizationUuid` lives in `.claude.json` and is captured with the snapshot.

<br>

## Keyboard shortcuts

| Shortcut | Action |
| :-- | :-- |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> / <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | Open Claude Manager |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> &rarr; *Claude Manager: Open* | Command palette fallback |

<br>

## Configuration

Open Settings (<kbd>Ctrl</kbd>+<kbd>,</kbd>) and search **Claude Manager**.

| Setting | Default | What it controls |
| :-- | :-- | :-- |
| `terminal.location` | `editor` | Open resumed sessions in the editor area or the bottom panel |
| `terminal.editorPosition` | `beside` | Which editor group terminals land in |
| `sessions.defaultFilter` | `recent` | Default date filter (recent / week / month / all) |
| `sessions.defaultProject` | `current` | Default project scope (current workspace or all projects) |
| `sessions.restoreWindowMinutes` | `30` | Time window used to group terminals for Restore Workspace |
| `sessions.resumeIn` | `auto` | Where Resume / New / Continue opens Claude: `auto` (match the session's origin), `terminal`, `extension` (Claude Code chat tab), or `ask` (prompt each time) |

Full reference in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

<br>

## FAQ

**Does it send anything to the network?**
Local-first by default &mdash; zero telemetry, zero accounts, no background traffic. The extension reads from `~/.claude/` and renders in a VS Code webview. There is **one** opt-in exception: the Account tab's **Quota** card, which you must click to fetch. When you do, the extension makes a single `GET https://api.anthropic.com/api/oauth/usage` request with your own OAuth token (taken from `~/.claude/.credentials.json`) to retrieve your subscription utilization. The token never leaves the extension host and nothing else is sent. Don't want it? Don't click Refresh &mdash; no network call happens.

**Where are saved account profiles stored?**
`~/.claude/manager-accounts/<slug>/` &mdash; each slot holds a copy of `~/.claude.json` and `~/.claude/.credentials.json` plus a small `profile.json` with the label. These files include OAuth tokens (same plaintext format Claude CLI uses), so treat the folder as sensitive. Remove a profile and its token copy is deleted immediately.

**Does it work with Cursor / Windsurf / VSCodium?**
Yes. It's a standard VS Code extension &mdash; install from the Marketplace (VS Code, Cursor, Windsurf) or [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager) (VSCodium, Theia, Gitpod).

**Do I need Claude Code installed?**
Yes. Claude Manager is a UI over Claude Code's local files &mdash; install Claude Code from [claude.ai/code](https://claude.ai/code) first.

**Does it modify my Claude config?**
Only when you explicitly act (enable/disable an MCP server, edit a permission, restore from a backup, rename or delete a session). All reads are passive.

**Where does my data live?**
In `~/.claude/` &mdash; same as Claude Code itself. The extension never copies, uploads, or duplicates your sessions.

<br>

## Compatibility

Works on every VS Code-based editor: **VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **VSCodium** &bull; **Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.85+ and [Claude Code](https://claude.ai/code) installed.

<br>

## What's new

See the [changelog](CHANGELOG.md) for release history, or browse [per-release notes](docs/releases/) for the full detail.

<br>

## Contributing

Bug reports and PRs are welcome. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the local setup, build, and architecture overview. Browse [open issues](https://github.com/vishalguptax/claude-code-manager/issues) or [open a new one](https://github.com/vishalguptax/claude-code-manager/issues/new).

<br>

## Support

If Claude Manager saves you time, consider [sponsoring the project](https://github.com/sponsors/vishalguptax). Sponsorship keeps development active and the extension free for everyone.

<br>

## Disclaimer

Claude Manager is an independent, community-built extension. It is not affiliated with, endorsed by, or sponsored by Anthropic. *Claude* and *Claude Code* are trademarks of Anthropic, PBC &mdash; used here only to describe the files this extension reads on your machine.

<br>

<div align="center">
<sub><a href="LICENSE">Apache 2.0</a> &copy; <a href="https://vishalg.in">Vishal Gupta</a></sub>
<br>
<sub><a href="https://vishalg.in">Portfolio</a> &bull; <a href="https://github.com/vishalguptax">GitHub</a> &bull; <a href="https://www.linkedin.com/in/vishalguptax">LinkedIn</a></sub>
</div>
