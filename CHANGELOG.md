# Changelog

## [1.0.0] - 2026-04-10

### Features
- **Sessions**: browse, search, filter, pin, rename, resume, fork, restore workspace
- **Skills**: browse global and project skills, copy name, delete, open Claude
- **Commands**: 52 built-in + custom slash commands with copy
- **Hooks**: view hooks across global, project, and local scopes
- **MCP Servers**: enable/disable toggle, delete, masked env vars, type badges
- **Agents**: browse project agents with model badges and descriptions
- Tab navigation across all 6 features
- Right-click context menu on sessions (pin, rename, fork, copy, delete)
- Branch detection with switch prompt on resume
- Restore Workspace — reopen all terminals from last working session
- Session rename (persisted locally, independent of Claude CLI)
- Claude terminal icon (coral theme color)
- Copy buttons on all list items (skills, commands, MCP)
- Detail pages with actions for every feature

### Performance
- Streaming JSONL parser (64KB chunks, never loads entire file)
- Single bounded file read per session for all metadata
- Event delegation (O(1) listeners instead of O(n))
- Session detail messages capped at 200
- Fast-path search (name/project/branch first, prompts as fallback)
- In-place cache updates for rename (no full re-parse)

### UI/UX
- Native VS Code theme integration
- Consistent search, filter, and scope UI across all tabs
- Scrollable detail views with fixed headers
- No layout shift on hover
- Works on VS Code, Cursor, Windsurf, Codespaces, Gitpod

### Reliability
- Error boundaries on all async handlers
- Message validation in webview
- Graceful handling of malformed JSONL, missing files, and corrupt state
- 89 unit tests
