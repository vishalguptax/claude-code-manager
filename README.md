<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager" width="100">

<h1>Claude Manager</h1>

<p><strong>All-in-one sidebar for <a href="https://claude.ai/code">Claude Code</a></strong></p>

<p>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
<a href="https://open-vsx.org/extension/vishalguptax/claude-manager"><img src="https://img.shields.io/badge/Open%20VSX-Registry-a60ee5?logo=eclipse&logoColor=white" alt="Open VSX"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-BSL%201.1-orange.svg" alt="License"></a>
</p>

<p>
<a href="#install">Install</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#features">Features</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#settings">Settings</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#compatibility">Compatibility</a>
</p>

</div>

<br>

> Browse sessions, skills, commands, hooks, MCP servers, and agents — all from one panel in your sidebar. Resume any session in one click. Manage your Claude Code config visually. 100% local, zero telemetry.

<br>

## Install

### From Marketplace

**VS Code / Cursor / Windsurf** &mdash; open Extensions (`Ctrl+Shift+X`), search `Claude Manager`, click Install.

**VSCodium / Eclipse Theia / Gitpod** &mdash; install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

### Manual Install

1. Download the `.vsix` file from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager), [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager), or [GitHub Releases](https://github.com/vishalguptax/claude-code-manager/releases/latest)
2. Open your editor &rarr; `Ctrl+Shift+P` &rarr; type **Install from VSIX** &rarr; select the downloaded file
3. Reload when prompted

**Or via terminal:**

```bash
code --install-extension path/to/claude-manager-x.x.x.vsix
```

> Replace `code` with `cursor`, `windsurf`, or `codium` depending on your editor.

<br>

## Features

<table>
<tr>
<td width="160"><strong>Sessions</strong></td>
<td>Browse, search, filter, pin, rename, resume, and fork your Claude Code sessions. Restore your entire workspace in one click.</td>
</tr>
<tr>
<td><strong>Skills</strong></td>
<td>View global and project skills. Copy names, open files, delete, or start a new Claude session.</td>
</tr>
<tr>
<td><strong>Commands</strong></td>
<td>52 built-in commands + your custom slash commands. Copy any command instantly.</td>
</tr>
<tr>
<td><strong>Hooks</strong></td>
<td>View automation hooks across global, project, and local scopes.</td>
</tr>
<tr>
<td><strong>MCP Servers</strong></td>
<td>Enable/disable servers, delete entries, view config with masked API keys.</td>
</tr>
<tr>
<td><strong>Agents</strong></td>
<td>Browse project agents with model badges and description previews.</td>
</tr>
</table>

<br>

### Sessions

- **Smart grouping** &mdash; Today, This Week, This Month, Older
- **Filter** by project, branch, or date range
- **Pin** favorites &bull; **Rename** sessions &bull; **Fork** for alternate explorations
- **Resume** with branch detection &mdash; warns if branches differ
- **Restore Workspace** &mdash; reopen every terminal from your last session
- **Search** across names, projects, branches, and prompts
- **Right-click menu** &mdash; pin, rename, fork, copy command, export as Markdown, delete

### Skills

- Global (`~/.claude/skills/`) and project-level (`.claude/skills/`)
- Scope badges, tags, descriptions from SKILL.md frontmatter
- Copy name, open file, delete, or launch Claude

### Commands

- **52 built-in** commands from official Claude Code docs
- Custom commands from `~/.claude/commands/` and `.claude/commands/`
- One-click copy for any command

### Hooks

- Global, project, and local scope support
- Flat and nested hook formats
- Event matcher and command shown for each hook

### MCP Servers

- Type badges &mdash; `stdio` / `http`
- **Enable/Disable** toggle &mdash; writes directly to `.mcp.json`
- **Delete** with confirmation
- Environment variables with automatic masking
- Project and global config support

### Agents

- Reads from `.claude/agents/`
- Model badges &mdash; Sonnet, Opus, Haiku
- Description previews from YAML frontmatter

<br>

## Settings

Open Settings (`Ctrl+,`) and search **Claude Manager**.

| Setting | Default | Description |
| :-- | :-- | :-- |
| Terminal Location | `editor` | Where to open terminals &mdash; `editor` (beside) or `panel` (bottom) |
| Editor Position | `beside` | Which editor group &mdash; `beside`, `active`, `one`, `two`, `three` |
| Default Date Filter | `recent` | Initial filter &mdash; `recent`, `week`, `month`, `all` |
| Default Project Filter | `current` | Show current project or `all` projects |
| Restore Window | `30` min | Time window for grouping sessions in Restore Workspace |

<br>

## Usage

| Action | Shortcut |
| :-- | :-- |
| Open panel | Click the **Claude Manager** icon in the activity bar |
| Focus panel | `Ctrl+Alt+C` / `Cmd+Alt+C` |
| Command palette | `Ctrl+Shift+P` &rarr; **Claude Manager: Open** |

<br>

## Compatibility

Works on every VS Code-based editor:

**VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **VSCodium** &bull; **Eclipse Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.85+ and [Claude Code](https://claude.ai/code) installed.

<br>

## Privacy

**100% local.** Reads from `~/.claude/`, renders in a webview. Zero network requests. Zero telemetry. Your data never leaves your machine.

<br>

## Contributing

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new). PRs welcome.

<br>

<div align="center">
<sub><a href="LICENSE">BSL 1.1</a> &copy; <a href="https://github.com/vishalguptax">Vishal Gupta</a></sub>
</div>
