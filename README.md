<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager" width="100">

<h1>Claude Manager</h1>

<p><strong>Every <a href="https://claude.ai/code">Claude Code</a> session, skill, slash command, hook, MCP server, and agent &mdash; one click away in your VS Code sidebar. Works with both the Claude Code CLI and the official VS Code extension.</strong></p>

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
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/demo.gif" alt="Claude Manager sidebar demo — sessions, skills, commands, hooks, MCP servers, agents, and account in VS Code" width="480">
</div>

<p align="center">
<sub>Local-first &bull; Zero telemetry &bull; Zero accounts &bull; Works in VS Code, Cursor, Windsurf, Antigravity, VSCodium, Codespaces, and Gitpod</sub>
</p>

<br>

## Install

**VS Code &bull; Cursor &bull; Windsurf &bull; Antigravity** &mdash; open Extensions (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search **Claude Manager**, click Install.

**VSCodium &bull; Theia &bull; Gitpod** &mdash; install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

**Command line** &mdash; `code --install-extension vishalguptax.claude-manager`

Then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> on Mac) to open the panel. That's it.

<br>

## Why it exists

Claude Code is powerful, but the terminal isn't built for browsing. Finding a session you ran last week means scrollback hunting. Editing an MCP server means hand-patching JSON. Keeping track of every custom slash command, hook, and agent is its own job.

Claude Manager turns all of it into a sidebar you can click and search. Same Claude Code underneath &mdash; just one keystroke closer. Works whether you use the Claude Code **CLI**, the official **VS Code extension**, or both; sessions from either surface show up in the same list, and Resume routes back to the surface each session came from (configurable).

<br>

## What's inside

| | |
| :-- | :-- |
| **Sessions** | Resume, continue, restore, pin, rename, fork, import, export, and full-text search across every Claude Code session. Filter by project and git branch. Resume warns if your current branch doesn't match. Auto-routes Resume to the terminal or the Claude Code extension chat tab based on where the session originated (configurable). |
| **Skills** | Global and project skills with scope badges. Copy, open, delete, or launch Claude with a skill in one click &mdash; terminal or extension chat. |
| **Commands** | Built-in slash commands plus your custom ones from `.claude/commands/`. One-click copy or launch in Claude Code chat. |
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
<sub>Built-in slash commands plus your custom ones from <code>.claude/commands/</code>. One-click copy.</sub>
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

**Does it work with Cursor / Windsurf / Antigravity / VSCodium?**
Yes. It's a standard VS Code extension &mdash; install from the Marketplace (VS Code, Cursor, Windsurf, Antigravity) or [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager) (VSCodium, Theia, Gitpod).

**Do I need Claude Code installed?**
Yes &mdash; install [Claude Code](https://claude.ai/code) first. Either the CLI, the official VS Code extension, or both works. Claude Manager reads from the shared `~/.claude/` directory, so sessions from either surface show up together.

**Does it modify my Claude config?**
Only when you explicitly act (enable/disable an MCP server, edit a permission, restore from a backup, rename or delete a session). All reads are passive.

**Where does my data live?**
In `~/.claude/` &mdash; same as Claude Code itself. The extension never copies, uploads, or duplicates your sessions.

<br>

## Compatibility

Works on every VS Code-based editor: **VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **Antigravity** &bull; **VSCodium** &bull; **Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.85+ and [Claude Code](https://claude.ai/code) installed.

<br>

## Contributing

Bug reports and PRs are welcome. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local setup, build, and architecture. Browse [open issues](https://github.com/vishalguptax/claude-code-manager/issues), [open a new one](https://github.com/vishalguptax/claude-code-manager/issues/new), or check the [changelog](CHANGELOG.md).

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
