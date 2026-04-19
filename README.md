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
<sub>100% local &bull; Zero telemetry &bull; Zero accounts &bull; Works in VS Code, Cursor, Windsurf, VSCodium, Codespaces, and Gitpod</sub>
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
| **Sessions** | Resume, continue, restore, pin, rename, fork, import, export, and full-text search across every Claude Code session. Filter by project and git branch. Resume warns if your current branch doesn't match. |
| **Skills** | Global and project skills with scope badges. Copy, open, delete, or launch Claude with a skill in one click. |
| **Commands** | 52 built-in slash commands plus your custom ones from `.claude/commands/`. One-click copy. |
| **Hooks** | Inspect automation hooks across global, project, and local scopes with full command preview. |
| **MCP Servers** | Enable, disable, delete, or inspect MCP servers &mdash; no JSON editing. API keys and secrets masked automatically. |
| **Agents** | Browse project agents with Sonnet / Opus / Haiku badges and description previews. |
| **Account** | Profile, activity heatmap, token usage across 7-day / 30-day / all-time, model selector, permissions editor. |
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
- **Resume** with branch detection &mdash; warns if your current branch differs
- **Continue** &mdash; pick up your most recent session in the current workspace (`claude --continue`)
- **Restore Workspace** &mdash; reopen every terminal from your last working session, stacked as tabs in one editor group
- **Import / Export** &mdash; export any session as a portable `.jsonl`, import it on another machine with a project picker and one-click resume
- **Right-click menu** &mdash; pin, rename, fork, copy command, export session, delete

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

Full reference in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

<br>

## FAQ

**Does it send anything to the network?**
No. Claude Manager reads from `~/.claude/` and renders in a VS Code webview. Zero network requests, zero telemetry, zero accounts.

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
