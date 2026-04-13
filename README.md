<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager" width="100">

<h1>Claude Manager</h1>

<p><strong><a href="https://claude.ai/code">Claude Code</a>, one click closer &mdash; every session, skill, command, hook, MCP server, and agent in your VS Code sidebar.</strong></p>

<p>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://img.shields.io/visual-studio-marketplace/v/vishalguptax.claude-manager?style=for-the-badge&label=Marketplace&labelColor=1a1a2e&color=007ACC&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
<a href="https://open-vsx.org/extension/vishalguptax/claude-manager"><img src="https://img.shields.io/open-vsx/v/vishalguptax/claude-manager?style=for-the-badge&label=Open%20VSX&labelColor=1a1a2e&color=a60ee5&logo=eclipseide&logoColor=white" alt="Open VSX"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://img.shields.io/visual-studio-marketplace/i/vishalguptax.claude-manager?style=for-the-badge&label=Installs&labelColor=1a1a2e&color=22c55e&logo=visualstudiocode&logoColor=white" alt="Installs"></a>
<a href="https://github.com/vishalguptax/claude-code-manager/stargazers"><img src="https://img.shields.io/github/stars/vishalguptax/claude-code-manager?style=for-the-badge&label=Stars&labelColor=1a1a2e&color=f59e0b&logo=github&logoColor=white" alt="GitHub Stars"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-f43f5e?style=for-the-badge&labelColor=1a1a2e" alt="License"></a>
</p>

</div>

<br>

<div align="center">
<img src="media/screenshots/01-sessions.png" alt="Claude Manager sidebar showing pinned and recent Claude Code sessions with git branches" width="420">
</div>

<p align="center">
<sub>100% local &bull; Zero telemetry &bull; Zero accounts &bull; Works in VS Code, Cursor, Windsurf, VSCodium, Codespaces, and Gitpod</sub>
</p>

<br>

## Install

**VS Code &bull; Cursor &bull; Windsurf** &mdash; open Extensions (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search **Claude Manager**, click Install.

**VSCodium &bull; Theia &bull; Gitpod** &mdash; install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

Then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> on Mac) to open the panel. That's it.

<br>

## Why it exists

Claude Code is powerful, but the terminal isn't built for browsing. Finding a session you ran last week means scrollback hunting. Editing an MCP server means hand-patching JSON. Keeping track of every custom slash command, hook, and agent is its own job.

Claude Manager turns all of it into a sidebar you can click and search. Same Claude Code underneath &mdash; just one keystroke closer.

<br>

## What's inside

- **Sessions** &mdash; resume any Claude Code session in one click, with git branch detection
- **Skills** &mdash; browse global and project skills, copy, open, or launch Claude with one
- **Commands** &mdash; 52 built-in slash commands plus your custom ones, one-click copy
- **Hooks** &mdash; inspect automation hooks across global, project, and local scopes
- **MCP Servers** &mdash; enable, disable, delete, or inspect &mdash; no JSON editing
- **Agents** &mdash; browse project agents with Sonnet / Opus / Haiku badges
- **Account** &mdash; profile, activity heatmap, token usage, permissions
- **Status bar** &mdash; open Claude Manager from anywhere in your editor

<table>
<tr>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/02-skills.png" alt="Skills tab" width="360"><br>
<strong>Skills</strong><br>
<sub>Global and project skills with scope badges. Copy, open, delete, or launch Claude with a skill.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/03-commands.png" alt="Commands tab" width="360"><br>
<strong>Commands</strong><br>
<sub>52 built-in slash commands plus your custom ones from <code>.claude/commands/</code>. One-click copy.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/04-hooks.png" alt="Hooks tab" width="360"><br>
<strong>Hooks</strong><br>
<sub>Inspect automation hooks across global, project, and local scopes with full command preview.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/05-mcp.png" alt="MCP servers tab" width="360"><br>
<strong>MCP Servers</strong><br>
<sub>Enable/disable, delete, or inspect MCP servers. API keys and secrets masked automatically.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/06-agents.png" alt="Agents tab" width="360"><br>
<strong>Agents</strong><br>
<sub>Browse project agents with Sonnet / Opus / Haiku badges and description previews.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="media/screenshots/07-account.png" alt="Account tab" width="360"><br>
<strong>Account</strong><br>
<sub>Profile, activity heatmap, token stats, and permissions &mdash; without leaving your editor.</sub>
</td>
</tr>
</table>

<br>

## Sessions, in depth

- **Smart grouping** &mdash; Today, This Week, This Month, Older
- **Relative timestamps** &mdash; `now`, `2m`, `4h`, `3d`, `1mo`, `1y`
- **Filter** by project, branch, or date range
- **Pin** favorites &bull; **Rename** sessions &bull; **Fork** for alternate explorations
- **Resume** with branch detection &mdash; warns if your current branch differs
- **Restore Workspace** &mdash; reopen every terminal from your last working session
- **Search** across names, projects, branches, and prompts
- **Right-click menu** &mdash; pin, rename, fork, copy command, export as Markdown, delete

<br>

## Privacy

**100% local.** Claude Manager reads from `~/.claude/` and renders in a VS Code webview. Zero network requests. Zero telemetry. Zero accounts. Your data never leaves your machine.

<br>

## Compatibility

Works on every VS Code-based editor: **VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **VSCodium** &bull; **Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.85+ and [Claude Code](https://claude.ai/code) installed.

<br>

## Configuration

Open Settings (<kbd>Ctrl</kbd>+<kbd>,</kbd>) and search **Claude Manager**. Available options:

- Terminal location (editor vs. panel) and editor position
- Default session filter and default project filter
- Restore Workspace time window

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full reference.

<br>

## Contributing

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new). PRs welcome.

<br>

<div align="center">
<sub><a href="LICENSE">Apache 2.0</a> &copy; <a href="https://vishalg.in">Vishal Gupta</a></sub>
<br>
<sub><a href="https://vishalg.in">Portfolio</a> &bull; <a href="https://github.com/vishalguptax">GitHub</a> &bull; <a href="https://www.linkedin.com/in/vishalguptax">LinkedIn</a></sub>
</div>
