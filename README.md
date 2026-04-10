<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Manager — VS Code extension to manage Claude Code sessions, MCP servers, skills, commands, hooks, and agents" width="120">

# Claude Manager

**The missing sidebar for [Claude Code](https://claude.ai/code).**

Browse sessions, skills, commands, hooks, MCP servers, and agents — all from one panel.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-Registry-a60ee5?logo=eclipse)](https://open-vsx.org/extension/vishalguptax/claude-manager)
[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-orange.svg)](LICENSE)

[Install](#quick-install) · [Features](#features) · [Usage](#usage) · [Compatibility](#compatibility)

</div>

---

A VS Code extension that gives you a sidebar panel to browse and manage everything in your `~/.claude/` directory. Resume any Claude Code session in one click, search your conversation history, manage MCP server configurations, and explore skills, commands, hooks, and agents — without leaving your editor.

## Quick Install

### From VS Code Marketplace

1. Open **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search **Claude Manager**
3. Click **Install**

Or run: `ext install vishalguptax.claude-manager`

### From Open VSX (VSCodium, Eclipse Theia, Gitpod)

1. Open **Extensions** → Search **Claude Manager** → **Install**

Or run: `ext install vishalguptax.claude-manager`

Or visit: [open-vsx.org/extension/vishalguptax/claude-manager](https://open-vsx.org/extension/vishalguptax/claude-manager)

### From GitHub Release

1. **[Download claude-manager-1.0.0.vsix](https://github.com/vishalguptax/claude-code-manager/releases/download/1.0.0/claude-code-manager-1.0.0.vsix)**
2. Open your editor → press `Ctrl+Shift+P` → type **Install from VSIX** → hit Enter
3. Select the downloaded file
4. Click **Reload** when prompted

**Or via CLI:**

```bash
code --install-extension claude-manager-1.0.0.vsix
```

> Replace `code` with `cursor`, `windsurf`, or `codium` for other IDEs.

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

Click the **Claude Manager** icon in the activity bar, or:

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

**Visual Studio Code** · **Cursor** · **Windsurf** · **VSCodium** · **Eclipse Theia** · **GitHub Codespaces** · **Gitpod**

</div>

Requires **VS Code 1.85.0+** and [Claude Code](https://claude.ai/code) installed.

---

## Contributing

Issues and PRs welcome. Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new).

---

<div align="center">

[BSL 1.1](LICENSE) © [Vishal Gupta](https://github.com/vishalguptax)

</div>
