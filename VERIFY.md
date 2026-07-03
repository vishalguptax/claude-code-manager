# v2.0 manual smoke checklist

The automated suites (vitest unit/component + `@vscode/test-electron`
integration) cover activation, message routing, parsers, and component
rendering. They cannot drive the live webview UI inside a real editor — the
webview runs in a sandboxed iframe the test host can't reach into. Run the
steps below by hand before tagging a release.

## Setup

```bash
npm ci
npm run build
# Launch the Extension Development Host: open the repo in VS Code and press F5,
# or install the packaged .vsix into a real editor:
npx @vscode/vsce package --no-dependencies -o dist/
# then: code --install-extension dist/claude-manager-2.0.0-beta.1.vsix
```

You need [Claude Code](https://claude.ai/code) installed and at least one real
Claude session in `~/.claude/` for the Sessions/Account tabs to show data.

## Per-tab smoke

Open the Claude Code Manager sidebar (Activity Bar icon, or `Ctrl/Cmd+Alt+C`). For
**each** tab, confirm: it loads without a spinner getting stuck, the
Developer Tools webview console shows **no red errors**, and the listed actions
work.

- [ ] **Sessions** — list renders; scroll a large list smoothly; search filters;
      project/branch/date filters work; click a session → detail view; Resume
      opens a terminal (or the Claude Code chat tab per `resumeIn`); Pin /
      Rename / Delete / Fork / Export each work; bulk mode selects + acts.
- [ ] **Skills** — global + project skills with scope badges; open a skill file;
      "Browse community skills" opens the configured URL.
- [ ] **Commands** — built-in + custom commands grouped by scope; copy a command;
      launch one in chat.
- [ ] **Hooks** — hooks across global/project/local scopes; add a hook via the
      wizard, then confirm it landed in the right `settings.json`; toggle and
      delete a hook; plugin hooks are read-only.
- [ ] **MCP** — servers grouped by scope; toggle enable/disable and confirm the
      `.mcp.json` / `~/.claude/mcp.json` changed on disk; delete a server
      (confirm dialog); plugin servers reject mutation with a message; open the
      config file.
- [ ] **Agents** — project/global/plugin agents with model badges; open an agent
      file.
- [ ] **Account** — Profile / Quota / Usage render; the **Quota** card stays idle
      until you opt in (no automatic network call); switch accounts via the
      switcher.
- [ ] **Config** — Behavior settings (model, tool-use mode, effort, toggles,
      attribution, retention) each persist to `settings.json`; Permissions
      scope toggle + search work; add/remove an allow and a deny entry;
      additional-directories add/remove; settings-history snapshots list and
      Restore works; Export / Import Brain + Run Diagnostics fire their commands.

## Cross-cutting

- [ ] Theme: switch the editor between a light and dark theme — the panel
      follows without reload.
- [ ] Reload: `Ctrl/Cmd+Alt+R` (view focused) re-parses every tab; no errors.
- [ ] Network: with DevTools → Network open, confirm the only request ever made
      is the Account quota fetch, and only after you click it.
- [ ] Settings round-trip: change a `claudeManager.*` setting in VS Code
      Settings; the panel reflects it without a reopen.
- [ ] Workspace switch: open a different folder; the project name + branch
      update in the Sessions tab.

## Known v2.0 limitations (expected, not bugs)

- Session-list date-group headers and persisted filter/collapse state reset on a
  full webview reload (virtualizer needs uniform rows; per-feature persistence
  is staged for a follow-up). Pinned-first ordering is preserved.
- The v1 cinematic first-run intro is gone.
