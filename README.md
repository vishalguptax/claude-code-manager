<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager" width="100">

<h1>Claude Manager</h1>

<p><strong>The missing sidebar for <a href="https://claude.ai/code">Claude Code</a></strong></p>

<p>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
<a href="https://open-vsx.org/extension/vishalguptax/claude-manager"><img src="https://img.shields.io/badge/Open%20VSX-Registry-a60ee5?logo=eclipse&logoColor=white" alt="Open VSX"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-BSL%201.1-orange.svg" alt="License"></a>
</p>

</div>

<br>

> Resume any Claude Code session in one click. Browse sessions, skills, commands, hooks, MCP servers, and agents from one panel in your sidebar. 100% local, zero telemetry.

<br>

<div align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/screenshots/01-sessions.png" alt="Claude Manager sidebar showing the Sessions tab with pinned and recent sessions" width="420">
</div>

<br>

## Install

**VS Code / Cursor / Windsurf** &mdash; open Extensions (`Ctrl+Shift+X`), search `Claude Manager`, click Install.

**VSCodium / Theia / Gitpod** &mdash; install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

Once installed, press **`Ctrl+Alt+C`** (`Cmd+Alt+C` on Mac) to open the panel. That's it.

<br>

## What's inside

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
<sub>Profile, activity heatmap, token stats, and permissions — without leaving your editor.</sub>
</td>
</tr>
</table>

<br>

## Sessions in depth

- **Smart grouping** &mdash; Today, This Week, This Month, Older
- **Filter** by project, branch, or date range
- **Pin** favorites &bull; **Rename** sessions &bull; **Fork** for alternate explorations
- **Resume** with branch detection &mdash; warns if your current branch differs
- **Restore Workspace** &mdash; reopen every terminal from your last working session
- **Search** across names, projects, branches, and prompts
- **Right-click menu** &mdash; pin, rename, fork, copy command, export as Markdown, delete

<br>

## Privacy

**100% local.** Reads from `~/.claude/`, renders in a webview. Zero network requests. Zero telemetry. Your data never leaves your machine.

<br>

## Compatibility

Works on every VS Code-based editor: **VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **VSCodium** &bull; **Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.85+ and [Claude Code](https://claude.ai/code) installed.

<br>

## Configuration

Open Settings (`Ctrl+,`) and search **Claude Manager**. Available options: terminal location, editor position, default session filter, default project filter, restore workspace window. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full reference.

<br>

## Contributing

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new). PRs welcome.

See [CHANGELOG.md](CHANGELOG.md) for release history.

<br>

<div align="center">
<sub><a href="LICENSE">BSL 1.1</a> &copy; <a href="https://github.com/vishalguptax">Vishal Gupta</a></sub>
</div>
