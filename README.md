<div align="center">

# Claude Code Manager

**The missing sidebar for Claude Code.**

Browse sessions, skills, commands, hooks, MCP servers, and agents — all from one panel.

[![License: BSL 1.1](https://img.shields.io/badge/License-BSL%201.1-orange.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC.svg)](https://code.visualstudio.com/)
[![Cursor](https://img.shields.io/badge/Cursor-compatible-8B5CF6.svg)](https://cursor.com)
[![Windsurf](https://img.shields.io/badge/Windsurf-compatible-06B6D4.svg)](https://windsurf.com)

</div>

---

Everything from your `~/.claude/` directory — organized into clean, searchable tabs in the activity bar. Resume any session in one click, manage your config visually, never leave your editor.

## Quick Install

```bash
curl -Lo /tmp/ccm.vsix https://github.com/vishalguptax/claude-code-manager/releases/latest/download/claude-code-manager-1.0.0.vsix && code --install-extension /tmp/ccm.vsix && rm /tmp/ccm.vsix
```

> Replace `code` with `cursor`, `windsurf`, or `codium` for other IDEs.

Or download the `.vsix` from [Releases](https://github.com/vishalguptax/claude-code-manager/releases) and install via `Ctrl+Shift+P` → **Extensions: Install from VSIX…**

---

## Features at a Glance

| Tab | What it does |
| :-- | :-- |
| **Sessions** | Browse, search, filter, pin, rename, resume, fork — your full session history |
| **Skills** | View global & project skills with copy, delete, and open-in-Claude actions |
| **Commands** | 52 built-in + your custom slash commands, all copyable |
| **Hooks** | Every hook across global, project, and local scopes |
| **MCP Servers** | Enable/disable, delete, inspect config with masked API keys |
| **Agents** | Project agents with model badges and description previews |

---

### Sessions

> Your Claude Code session history — searchable, filterable, and one-click resumable.

- **Smart grouping** — Today, This Week, This Month, Older
- **Filter** by project, branch, or date range
- **Pin** important sessions to the top
- **Rename** sessions (persisted locally, works even when CLI `/rename` doesn't)
- **Resume** with branch detection — warns if you're on a different branch
- **Fork** sessions for alternate explorations
- **Restore Workspace** — reopen every terminal from your last working session
- **Right-click menu** — pin, rename, fork, copy command, copy as Markdown, delete
- **Search** across names, projects, branches, and prompts

### Skills

> Browse all installed Claude Code skills.

- Global (`~/.claude/skills/`) and project-level (`.claude/skills/`)
- Scope badges, tags, and descriptions from SKILL.md frontmatter
- Copy skill name, open file, delete, or launch a new Claude session

### Commands

> Every slash command at your fingertips.

- **52 built-in** commands from the official Claude Code docs
- Custom commands from `~/.claude/commands/` and `.claude/commands/`
- One-click copy for any command

### Hooks

> See what's wired up across all scopes.

- Global (`~/.claude/settings.json`), project (`.claude/settings.json`), local (`.claude/settings.local.json`)
- Supports both flat and nested hook formats
- Event matcher and command shown for each hook

### MCP Servers

> Manage your MCP server configurations visually.

- Type badges — `stdio` / `http`
- **Enable/Disable toggle** — writes directly to `.mcp.json`
- **Delete** servers from config
- Environment variables with automatic sensitive value masking
- Works with both project (`.mcp.json`) and global (`~/.claude/mcp.json`) configs

### Agents

> Browse your project's custom agents.

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

## Performance

Built to handle large histories without freezing your editor.

- **Streaming JSONL parser** — reads in 64KB chunks, never loads entire files into memory
- **Single bounded read** per session file for all metadata extraction
- **Event delegation** — O(1) event listeners, not O(n)
- **Capped payloads** — detail views limited to prevent large postMessage transfers
- **Fast-path search** — checks short fields first, scans prompts only as fallback
- **In-place cache updates** — rename/pin/delete don't trigger full re-parse

---

## Privacy

**100% local.** Reads files from `~/.claude/`, renders in a webview. No network requests, no telemetry, no tracking. Your data never leaves your machine.

---

## Compatibility

Works on every VS Code-based editor:

<div align="center">

**VS Code** · **Cursor** · **Windsurf** · **VSCodium** · **GitHub Codespaces** · **Gitpod**

</div>

Requires **VS Code 1.85.0+** and [Claude Code](https://claude.ai/code) installed (needs `~/.claude/` data directory).

---

## Development

```bash
git clone https://github.com/vishalguptax/claude-code-manager.git
cd claude-code-manager
npm install
npm run build
```

Press `F5` to launch the Extension Development Host, or package a `.vsix`:

```bash
npm run package
```

```bash
npm test              # 89 unit tests
npm run test:watch    # Watch mode
```

---

## Contributing

Issues and PRs welcome at [github.com/vishalguptax/claude-code-manager](https://github.com/vishalguptax/claude-code-manager).

Found a bug? [Open an issue](https://github.com/vishalguptax/claude-code-manager/issues/new).

---

<div align="center">

## License

[BSL 1.1](LICENSE) © [Vishal Gupta](https://github.com/vishalguptax)

Use freely. Contribute freely. Cannot fork as a competing extension.
Converts to **MIT** on April 9, 2030.

</div>
