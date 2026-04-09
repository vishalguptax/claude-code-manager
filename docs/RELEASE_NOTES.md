# v1.0.0

Initial release of **Claude Code Manager** — an all-in-one VS Code sidebar to browse and manage your Claude Code data.

## Features

### Sessions
- Browse all Claude Code sessions sorted by last activity
- Search across session names, projects, branches, and prompts
- Filter by project, date range (Recent / Week / Month / All)
- Pin important sessions to the top
- Rename sessions (persisted locally, independent of CLI)
- Resume any session in a terminal with one click
- Fork sessions for alternate explorations
- Branch detection — warns if resuming on a different branch
- Restore Workspace — reopen all terminals from your last working session
- Right-click context menu with quick actions
- Copy resume command or session transcript as Markdown

### Skills
- Browse global (`~/.claude/skills/`) and project-level (`.claude/skills/`) skills
- Copy skill name with one click
- Open skill files directly in the editor
- Delete skills with confirmation
- Open a new Claude session from the skill detail page

### Commands
- Browse custom slash commands from `~/.claude/commands/` and `.claude/commands/`
- Full catalog of 52 built-in Claude Code commands from official docs
- Copy any command name with one click
- Open command files in the editor

### Hooks
- View automation hooks across all three scopes: global, project, and local
- Supports both flat and nested hook formats
- Shows event matcher and command for each hook

### MCP Servers
- View MCP server configurations from `.mcp.json` and `~/.claude/mcp.json`
- Type badges (stdio / http) and scope badges (project / global)
- Enable/Disable toggle — writes `disabled` field directly to config
- Delete servers from config with confirmation
- Sensitive environment variables automatically masked
- Copy server name with one click

### Agents
- Browse project agents from `.claude/agents/`
- Model badges (Sonnet / Opus / Haiku)
- Description previews from YAML frontmatter

## UI/UX
- Native VS Code theme integration — looks right in any theme
- Tab-based navigation across all 6 features
- Consistent search and filter UI across all tabs
- Copy buttons on every list item (visible on hover)
- Detail views with action buttons and scrollable content
- Footer with GitHub and LinkedIn links
- Works on all VS Code-based IDEs: VS Code, Cursor, Windsurf, Codespaces, Gitpod

## Performance
- Streaming JSONL parser — reads files in 64KB chunks, never loads entire file into memory
- Session metadata extracted in a single bounded file read per session
- Event delegation — O(1) listeners instead of O(n) per list
- Session detail messages capped at 200 to prevent large payloads
- Search uses fast-path matching (name/project/branch/summary) before scanning prompts
- Rename updates cached session in-place without re-parsing from disk
- Error boundaries on all async handlers — no silent crashes

## Install

Download `claude-code-manager-1.0.0.vsix` from the assets below and run:

```bash
code --install-extension claude-code-manager-1.0.0.vsix
```

Or one-liner:

```bash
curl -Lo /tmp/ccm.vsix https://github.com/vishalguptax/claude-code-manager/releases/latest/download/claude-code-manager-1.0.0.vsix && code --install-extension /tmp/ccm.vsix && rm /tmp/ccm.vsix
```

Or manually: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → select the file.

## Requirements

- [Claude Code](https://claude.ai/code) installed and used at least once
- VS Code 1.85.0 or later

## License

[BSL 1.1](../LICENSE) — use freely, contribute freely. Cannot fork and publish a competing extension. Converts to MIT on April 9, 2029.
