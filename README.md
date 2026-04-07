# Claude Code Manager

All-in-one manager for [Claude Code](https://claude.ai/code) — browse sessions, skills, commands, hooks, MCP servers, and agents from your VS Code sidebar.

## Features

### Sessions
Browse and manage all your Claude Code terminal sessions. Search, filter by project and date, pin favorites, resume with one click.

- Session list sorted by last activity
- Filter by current project, date range (Today/Week/Month/All)
- Pin, delete, fork sessions
- Resume in terminal with branch detection
- Right-click context menu for quick actions

### Skills
View all installed Claude Code skills — both global (`~/.claude/skills/`) and project-level (`.claude/skills/`).

### Commands
Browse custom slash commands from `~/.claude/commands/` and `.claude/commands/`.

### Hooks
View automation hooks configured in Claude Code settings.

### MCP Servers
View MCP server configurations from `.mcp.json` with type badges (stdio/http) and masked API keys.

### Agents
Browse project agents from `.claude/agents/` with model badges (Sonnet/Opus/Haiku).

## Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search "Claude Code Manager"
4. Click Install

### From VSIX
1. Download the `.vsix` file from [Releases](https://github.com/vishalguptax/claude-code-manager/releases)
2. `Ctrl+Shift+P` > "Extensions: Install from VSIX"
3. Select the file

## Usage

Click the Claude Code Manager icon in the activity bar (sidebar), or:
- `Ctrl+Alt+C` / `Cmd+Alt+C` to focus the panel
- `Ctrl+Shift+P` > "Claude: Open Code Manager"

## Requirements

- [Claude Code](https://claude.ai/code) installed and used at least once (creates `~/.claude/` data)
- VS Code 1.85.0 or later

## Compatibility

Works on all VS Code-based IDEs:
- Visual Studio Code
- Cursor
- Windsurf
- GitHub Codespaces
- Gitpod

## Development

```bash
git clone https://github.com/vishalguptax/claude-code-manager.git
cd claude-code-manager
npm install
npm run build
# Install: Ctrl+Shift+P > "Extensions: Install from VSIX" > select .vsix
```

### Testing
```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

## License

MIT - [Vishal Gupta](https://github.com/vishalguptax)
