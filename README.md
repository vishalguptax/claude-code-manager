# Claude Code Manager

> All-in-one sidebar manager for [Claude Code](https://claude.ai/code) — browse **sessions**, **skills**, **commands**, **hooks**, **MCP servers**, and **agents** without leaving your editor.

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-orange.svg)](LICENSE)

Everything from your `~/.claude/` directory, organized into clean, searchable tabs right in the activity bar. Resume any past session in one click, jump between projects, and manage your Claude Code configuration visually.

---

## Features

### Sessions

Browse every Claude Code conversation — searchable, filterable, and resumable.

- Sorted by last activity, grouped by **Today / This Week / This Month / Older**
- Filter by **project**, **branch**, or **date range**
- **Recent** view always shows your top 20 latest sessions
- **Pin** important sessions, **delete** noise
- **Resume** in a terminal with automatic branch detection and warning if branches differ
- **Fork** a session (`--fork-session`) for alternate explorations
- **Restore Workspace** — reopens every session that was active the last time you used Claude Code
- Honors custom names set via `/rename`
- Right-click context menu for copy-command, copy-as-Markdown, open-project, and more

### Skills

Lists all installed skills from `~/.claude/skills/` (global) and `.claude/skills/` (project-level), with scope badges, descriptions, and one-click file open.

### Commands

Browse **custom slash commands** from `~/.claude/commands/` and `.claude/commands/`, alongside the full catalog of **52 built-in** Claude Code commands sourced from the official docs.

### Hooks

View every hook configured across **global**, **project**, and **local** scopes — `~/.claude/settings.json`, `.claude/settings.json`, and `.claude/settings.local.json`. Supports both flat and nested hook formats.

### MCP Servers

Inspect MCP server configurations from `.mcp.json` with type badges (`stdio` / `http` / `sse`) and automatically masked API keys.

### Agents

Browse project agents from `.claude/agents/` with model badges (`Sonnet` / `Opus` / `Haiku`) and description previews.

---

## Installation

### From VS Code Marketplace

1. Open **Extensions** (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for **Claude Code Manager**
3. Click **Install**

Or install directly:

```
ext install vishalguptax.claude-code-manager
```

### One-command install (from GitHub)

```bash
curl -Lo /tmp/ccm.vsix https://github.com/vishalguptax/claude-code-manager/releases/latest/download/claude-code-manager-1.0.0.vsix && code --install-extension /tmp/ccm.vsix && rm /tmp/ccm.vsix
```

### From VSIX (manual)

1. Download the latest `.vsix` from [Releases](https://github.com/vishalguptax/claude-code-manager/releases)
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX…**
3. Select the downloaded file

---

## Usage

Click the **Claude Code Manager** icon in the activity bar, or:

| Action | Shortcut |
| :-- | :-- |
| Focus the panel | `Ctrl+Alt+C` / `Cmd+Alt+C` |
| Open via command palette | `Ctrl+Shift+P` → **Claude: Open Code Manager** |

---

## Requirements

- [**Claude Code**](https://claude.ai/code) installed and used at least once (creates the `~/.claude/` data directory)
- **VS Code 1.85.0** or later

---

## Compatibility

Works on every VS Code-based editor:

- Visual Studio Code
- Cursor
- Windsurf
- VSCodium
- GitHub Codespaces
- Gitpod

---

## Privacy

This extension is **100% local**. It reads files from your `~/.claude/` directory, renders them in a webview, and never makes a network request. No telemetry, no tracking, no data leaves your machine.

---

## Development

```bash
git clone https://github.com/vishalguptax/claude-code-manager.git
cd claude-code-manager
npm install
npm run build
```

Then press `F5` in VS Code to launch an Extension Development Host, or package a `.vsix`:

```bash
npm run package
```

### Testing

```bash
npm test            # Run all unit tests
npm run test:watch  # Watch mode
npm run test:coverage
```

---

## Contributing

Issues and pull requests are welcome at [github.com/vishalguptax/claude-code-manager](https://github.com/vishalguptax/claude-code-manager).

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new).

---

## License

[BSL 1.1](LICENSE) © [Vishal Gupta](https://github.com/vishalguptax)

Licensed under the Business Source License 1.1. You can use, modify, and contribute freely. You cannot fork and publish a competing VS Code extension. Converts to MIT on **April 9, 2029**.
