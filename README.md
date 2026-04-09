<div align="center">

<img src="media/marketplace-icon.png" alt="Claude Code Manager — VS Code extension to manage Claude Code sessions, MCP servers, skills, commands, hooks, and agents" width="120">

# Claude Code Manager

**The missing sidebar for [Claude Code](https://claude.ai/code).**

Browse sessions, skills, commands, hooks, MCP servers, and agents — all from one panel.

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-orange.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC.svg)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-8B5CF6.svg)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-compatible-06B6D4.svg)](https://windsurf.com)

[Install](#quick-install) · [Features](#features) · [Usage](#usage) · [Compatibility](#compatibility)

</div>

---

A VS Code extension that gives you a sidebar panel to browse and manage everything in your `~/.claude/` directory. Resume any Claude Code session in one click, search your conversation history, manage MCP server configurations, and explore skills, commands, hooks, and agents — without leaving your editor.

## Quick Install

### Option A — From the editor

1. **[Download claude-code-manager-1.0.0.vsix](https://github.com/vishalguptax/claude-code-manager/releases/download/1.0.0/claude-code-manager-1.0.0.vsix)**
2. Open your editor → press `Ctrl+Shift+P` → type **Install from VSIX** → hit Enter
3. Select the downloaded `claude-code-manager-1.0.0.vsix` file
4. Click **Reload** when prompted

### Option B — From the terminal

Open a terminal and run the command for your OS:

**macOS / Linux:**

```bash
cd ~/Downloads && code --install-extension claude-code-manager-1.0.0.vsix
```

**Windows (PowerShell):**

```powershell
cd $HOME\Downloads; code --install-extension claude-code-manager-1.0.0.vsix
```

> Using a different editor? Replace `code` with your CLI:
> | Editor | CLI command |
> | :-- | :-- |
> | VS Code | `code` |
> | Cursor | `cursor` |
> | Windsurf | `windsurf` |
> | VSCodium | `codium` |

After running, reload your editor window to activate the extension.

---

## Features

| Tab | What you can do |
| :-- | :-- |
| **Sessions** | Browse, search, filter, pin, rename, resume, fork — your full Claude Code session history |
| **Skills** | View global & project skills with copy, delete, and open-in-Claude actions |
| **Commands** | 52 built-in + your custom slash commands, all copyable |
| **Hooks** | Every automation hook across global, project, and local scopes |
| **MCP Servers** | Enable/disable MCP servers, delete, inspect config with masked API keys |
| **Agents** | Project agents with model badges (Sonnet, Opus, Haiku) and descriptions |

---

### Claude Code Session Manager

> Search, filter, and resume your Claude Code conversations.

- **Smart grouping** — Today, This Week, This Month, Older
- **Filter** by project, branch, or date range
- **Pin** important sessions to the top
- **Rename** sessions (persisted locally — works even when CLI `/rename` doesn't)
- **Resume** with branch detection — warns if you switched branches
- **Fork** sessions for alternate explorations (`--fork-session`)
- **Restore Workspace** — reopen every terminal from your last working session
- **Right-click menu** — pin, rename, fork, copy resume command, copy as Markdown, delete
- **Search** across session names, projects, branches, and prompts

### Claude Code Skills Browser

> Browse all installed Claude Code skills from the sidebar.

- Global skills (`~/.claude/skills/`) and project-level skills (`.claude/skills/`)
- Scope badges, tags, and descriptions from SKILL.md frontmatter
- Copy skill name, open file, delete, or launch a new Claude session

### Claude Code Commands Browser

> Every slash command at your fingertips.

- **52 built-in** Claude Code commands from the official docs
- Custom commands from `~/.claude/commands/` and `.claude/commands/`
- One-click copy for any command

### Claude Code Hooks Viewer

> See what automation hooks are wired up.

- Global (`~/.claude/settings.json`), project (`.claude/settings.json`), local (`.claude/settings.local.json`)
- Supports both flat and nested hook formats
- Event matcher and command shown for each hook

### MCP Server Manager

> Manage Model Context Protocol server configurations visually.

- Type badges — `stdio` / `http`
- **Enable/Disable toggle** — writes `disabled` field directly to `.mcp.json`
- **Delete** servers from config with confirmation
- Environment variables with automatic sensitive value masking
- Works with both project (`.mcp.json`) and global (`~/.claude/mcp.json`) configs

### Claude Code Agents Browser

> Browse your project's custom Claude agents.

- Reads from `.claude/agents/`
- Model badges — Sonnet, Opus, Haiku
- Description previews from YAML frontmatter

---

## Usage

Click the **Claude Code Manager** icon in the activity bar, or:

| Action | Shortcut |
| :-- | :-- |
| Focus the panel | `Ctrl+Alt+C` / `Cmd+Alt+C` |
| Command palette | `Ctrl+Shift+P` → **Claude: Open Code Manager** |

---

## Privacy

**100% local.** Reads files from your `~/.claude/` directory, renders them in a webview. Zero network requests, zero telemetry, zero tracking. Your Claude Code data never leaves your machine.

---

## Compatibility

Works on every VS Code-based editor:

<div align="center">

**Visual Studio Code** · **Cursor** · **Windsurf** · **VSCodium** · **GitHub Codespaces** · **Gitpod**

</div>

Requires **VS Code 1.85.0+** and [Claude Code](https://claude.ai/code) installed.

---

## Contributing

Issues and PRs welcome. Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new).

---

<div align="center">

[BSL 1.1](LICENSE) © [Vishal Gupta](https://github.com/vishalguptax)

</div>
