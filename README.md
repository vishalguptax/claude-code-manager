<div align="center">

<br />

<img src="media/icon.svg" width="64" height="64" alt="Claude Code Manager" />

<br />

# Claude Code Manager

**The missing sidebar for [Claude Code](https://claude.ai/code).**

Browse sessions, skills, commands, hooks, MCP servers, and agents — without leaving your editor.

<br />

[![License](https://img.shields.io/badge/license-BSL%201.1-E07B39?style=flat-square)](LICENSE)
&nbsp;
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-007ACC?style=flat-square&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
&nbsp;
[![Cursor](https://img.shields.io/badge/Cursor-compatible-8B5CF6?style=flat-square)](https://cursor.com)
&nbsp;
[![Windsurf](https://img.shields.io/badge/Windsurf-compatible-06B6D4?style=flat-square)](https://windsurf.com)

<br />

**[Install](#install)** &nbsp;&middot;&nbsp; **[Features](#features)** &nbsp;&middot;&nbsp; **[Usage](#usage)** &nbsp;&middot;&nbsp; **[Contributing](#contributing)**

<br />

</div>

---

Everything in your `~/.claude/` directory — organized into clean, searchable tabs right in the activity bar. Resume any session in one click, manage your config visually, and stay in flow.

<br />

## Install

**One command:**

```bash
curl -Lo /tmp/ccm.vsix https://github.com/vishalguptax/claude-code-manager/releases/latest/download/claude-code-manager-1.0.0.vsix \
  && code --install-extension /tmp/ccm.vsix \
  && rm /tmp/ccm.vsix
```

> **Using Cursor, Windsurf, or VSCodium?** Replace `code` with `cursor`, `windsurf`, or `codium`.

**Or manually** — download `.vsix` from [Releases](https://github.com/vishalguptax/claude-code-manager/releases), then `Ctrl+Shift+P` &rarr; **Extensions: Install from VSIX...**

<br />

## Features

<table>
<tr>
<td width="140"><strong>Sessions</strong></td>
<td>Browse, search, filter, pin, rename, resume, fork &mdash; your full session history</td>
</tr>
<tr>
<td><strong>Skills</strong></td>
<td>Global & project skills with copy, delete, and open-in-Claude actions</td>
</tr>
<tr>
<td><strong>Commands</strong></td>
<td>52 built-in + your custom slash commands, all copyable</td>
</tr>
<tr>
<td><strong>Hooks</strong></td>
<td>Every hook across global, project, and local scopes</td>
</tr>
<tr>
<td><strong>MCP Servers</strong></td>
<td>Enable/disable, delete, inspect config with masked API keys</td>
</tr>
<tr>
<td><strong>Agents</strong></td>
<td>Project agents with model badges and description previews</td>
</tr>
</table>

<br />

### Sessions

Your Claude Code session history &mdash; searchable, filterable, one-click resumable.

<table><tr><td>

- **Smart grouping** &mdash; Today / This Week / This Month / Older
- **Filter** by project, branch, or date range
- **Pin** &amp; **rename** sessions (persisted locally, works even when CLI `/rename` doesn't)
- **Resume** with branch detection &mdash; warns if you're on a different branch
- **Fork** sessions for alternate explorations
- **Restore Workspace** &mdash; reopen every terminal from your last session
- **Right-click menu** &mdash; pin, rename, fork, copy command, copy as Markdown, delete
- **Search** across names, projects, branches, and prompts

</td></tr></table>

### Skills

Browse all installed Claude Code skills at a glance.

<table><tr><td>

- Global (`~/.claude/skills/`) and project-level (`.claude/skills/`)
- Scope badges, tags, and descriptions from SKILL.md frontmatter
- Copy skill name, open file, delete, or launch a new Claude session

</td></tr></table>

### Commands

Every slash command at your fingertips.

<table><tr><td>

- **52 built-in** commands from the official Claude Code docs
- Custom commands from `~/.claude/commands/` and `.claude/commands/`
- One-click copy for any command

</td></tr></table>

### Hooks

See what's wired up across all scopes.

<table><tr><td>

- Global, project, and local settings files
- Supports both flat and nested hook formats
- Event matcher and command shown for each hook

</td></tr></table>

### MCP Servers

Manage your MCP server configurations visually.

<table><tr><td>

- Type badges &mdash; `stdio` / `http`
- **Enable/Disable toggle** &mdash; writes directly to `.mcp.json`
- **Delete** servers from config with confirmation
- Environment variables with automatic sensitive value masking
- Works with project and global configs

</td></tr></table>

### Agents

Browse your project's custom agents.

<table><tr><td>

- Reads from `.claude/agents/`
- Model badges &mdash; Sonnet, Opus, Haiku
- Description previews from YAML frontmatter

</td></tr></table>

<br />

## Usage

Click the **Claude Code Manager** icon in the activity bar, or:

| Action | Shortcut |
| :-- | :-- |
| Focus the panel | `Ctrl+Alt+C` / `Cmd+Alt+C` |
| Command palette | `Ctrl+Shift+P` &rarr; **Claude: Open Code Manager** |

<br />

## Under the Hood

Built to handle thousands of sessions without freezing your editor.

| | |
| :-- | :-- |
| **Streaming parser** | Reads JSONL in 64KB chunks &mdash; never loads entire files into memory |
| **Bounded reads** | Single file read per session for all metadata extraction |
| **Event delegation** | O(1) listeners on containers, not O(n) per item |
| **Capped payloads** | Detail views limited to prevent oversized transfers |
| **Fast-path search** | Short fields first, prompt scan only as fallback |
| **In-place cache** | Pin/rename/delete update memory &mdash; no full re-parse |

<br />

## Privacy

> **100% local.** Reads `~/.claude/`, renders in a webview. Zero network requests. Zero telemetry. Your data never leaves your machine.

<br />

## Compatibility

<div align="center">

**VS Code** &nbsp;&bull;&nbsp; **Cursor** &nbsp;&bull;&nbsp; **Windsurf** &nbsp;&bull;&nbsp; **VSCodium** &nbsp;&bull;&nbsp; **Codespaces** &nbsp;&bull;&nbsp; **Gitpod**

</div>

<br />

Requires **VS Code 1.85.0+** and [Claude Code](https://claude.ai/code) (needs the `~/.claude/` data directory).

<br />

## Development

```bash
git clone https://github.com/vishalguptax/claude-code-manager.git
cd claude-code-manager
npm install
npm run build        # Build extension + webview
npm run package      # Create .vsix
npm test             # 89 unit tests
```

Press `F5` to launch the Extension Development Host.

<br />

## Contributing

Issues and PRs welcome at [github.com/vishalguptax/claude-code-manager](https://github.com/vishalguptax/claude-code-manager).

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new).

---

<div align="center">

<br />

**[BSL 1.1](LICENSE)** &copy; [Vishal Gupta](https://github.com/vishalguptax)

Use freely. Contribute freely. Cannot fork as a competing extension.

Converts to **MIT** on April 9, 2030.

<br />

</div>
