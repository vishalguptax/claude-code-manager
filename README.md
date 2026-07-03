<div align="center">

<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/marketplace-icon.png" alt="Claude Code Manager" width="100">

<h1>Claude Code Manager</h1>
<p><em>(formerly Claude Manager)</em></p>

<p><strong>Every <a href="https://claude.ai/code">Claude Code</a> session, skill, slash command, hook, MCP server, and agent, one click away in your VS Code sidebar. Works with both the Claude Code CLI and the official VS Code extension.</strong></p>

<p><a href="https://claudemanager.vishalg.in"><strong>claudemanager.vishalg.in</strong></a></p>

<p>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://vsmarketplacebadges.dev/version-short/vishalguptax.claude-manager.svg?style=for-the-badge&label=Marketplace&labelColor=1a1a2e&color=007ACC&logo=visualstudiocode&logoColor=white" alt="VS Code Marketplace"></a>
<a href="https://open-vsx.org/extension/vishalguptax/claude-manager"><img src="https://img.shields.io/open-vsx/v/vishalguptax/claude-manager?style=for-the-badge&label=Open%20VSX&labelColor=1a1a2e&color=a60ee5&logo=eclipseide&logoColor=white" alt="Open VSX"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager"><img src="https://vsmarketplacebadges.dev/installs-short/vishalguptax.claude-manager.svg?style=for-the-badge&label=Installs&labelColor=1a1a2e&color=22c55e&logo=visualstudiocode&logoColor=white" alt="Installs"></a>
<a href="https://github.com/vishalguptax/claude-code-manager/stargazers"><img src="https://img.shields.io/github/stars/vishalguptax/claude-code-manager?style=for-the-badge&label=Stars&labelColor=1a1a2e&color=f59e0b&logo=github&logoColor=white" alt="GitHub Stars"></a>
<a href="#faq"><img src="https://img.shields.io/badge/100%25_Local-zero%20network-22c55e?style=for-the-badge&labelColor=1a1a2e&logo=ghostery&logoColor=white" alt="100% Local, zero network calls"></a>
<a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-f43f5e?style=for-the-badge&labelColor=1a1a2e" alt="License"></a>
<a href="https://github.com/sponsors/vishalguptax"><img src="https://img.shields.io/badge/Sponsor-%E2%99%A5-ec4899?style=for-the-badge&labelColor=1a1a2e&logo=githubsponsors&logoColor=white" alt="Sponsor"></a>
</p>

</div>

<br>

<div align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/media/demo.gif" alt="Claude Code Manager sidebar demo showing sessions, skills, commands, hooks, MCP servers, agents, and account in VS Code" width="480">
</div>

<p align="center">
<sub>Local-first &bull; Zero telemetry &bull; Zero accounts &bull; Works in VS Code, Cursor, Windsurf, Antigravity, VSCodium, Codespaces, and Gitpod</sub>
</p>

<br>

> [!NOTE]
> **100% local. Zero network calls.** Claude Code Manager reads `~/.claude/` and renders in your sidebar under a strict CSP. No telemetry, no accounts, no token ever leaves your machine. Even the live Quota card reads Claude Code's own statusline from disk, never the network.

## Install

**VS Code, Cursor, Windsurf, Antigravity:** open Extensions (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search **Claude Code Manager**, click Install.

**VSCodium, Theia, Gitpod:** install from [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager).

**Command line:** `code --install-extension vishalguptax.claude-manager`

<br>

### Open the panel

Three ways, pick whichever is closest:

| Way | How |
| :-- | :-- |
| **Keyboard** | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> on Windows/Linux, <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> on macOS |
| **Status bar** | Click the **Claude Code Manager** chip at the bottom of the editor |
| **Command palette** | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> &rarr; *Claude Code Manager: Open* |

That's it.

<br>

## Why it exists

Claude Code is powerful, but the terminal isn't built for browsing. Finding a session you ran last week means scrollback hunting. Editing an MCP server means hand-patching JSON. Keeping track of every custom slash command, hook, and agent is its own job.

Claude Code Manager turns all of it into a sidebar you can click and search. Same Claude Code underneath, just one keystroke closer. It works whether you run the Claude Code **CLI**, the official **VS Code extension**, or both. Sessions from either show up in the same list, and Resume sends you back to wherever the session started (configurable).

It also folds the jobs you'd otherwise wire up with separate single-purpose tools into one install: a usage tracker (like ccusage), an account switcher (like claude-swap), and an MCP manager all live in the same sidebar.

So you can **switch between Claude accounts in VS Code** without a full logout and login, **track Claude Code token usage** alongside your 5-hour and 7-day subscription quota, **manage MCP servers without editing JSON**, **resume past sessions** by project and git branch, and organize your **skills, slash commands, hooks, and agents**. All of it one click away in your editor.

<br>

## What's inside

<table>
<tr>
<td width="160" align="center"><strong>Sessions</strong></td>
<td>Active sessions pinned to the top with live status dots. <strong>View</strong> action focuses the terminal hosting a running session (any shell, including external CLIs). Resume, continue, restore-workspace, pin, rename, fork, import, export, bulk-select. Full-text transcript search. Filter by project + git branch, current scope marked + pinned. ai-title display, ephemeral "temp" sessions that wipe on close.</td>
</tr>
<tr>
<td align="center"><strong>Skills</strong></td>
<td>Global, project, and plugin-shipped skills with scope badges. Copy, open, delete, or launch Claude with a skill in one click, in the terminal or the extension chat.</td>
</tr>
<tr>
<td align="center"><strong>Commands</strong></td>
<td>Built-in slash commands plus your custom ones from <code>.claude/commands/</code> and installed plugins. One-click copy or launch in Claude Code chat.</td>
</tr>
<tr>
<td align="center"><strong>Hooks</strong></td>
<td>Inspect, toggle, edit, or remove automation hooks across global, project, and local scopes with full command preview. Live across every settings scope.</td>
</tr>
<tr>
<td align="center"><strong>MCP Servers</strong></td>
<td>Enable, disable, delete, or inspect MCP servers, no JSON editing. API keys and secrets masked automatically. <strong>Auth-health banner</strong> surfaces connectors that need re-auth.</td>
</tr>
<tr>
<td align="center"><strong>Agents</strong></td>
<td>Browse project and plugin agents with Sonnet / Opus / Haiku badges and description previews.</td>
</tr>
<tr>
<td align="center"><strong>Account</strong></td>
<td><strong>Multi-account profile switcher</strong> (save + swap Claude logins without full <code>/logout</code>+<code>/login</code>). Activity heatmap. Token usage across 7-day / 30-day / all-time. Per-model, per-project, per-tool breakdowns with cache-hit %. Opt-in <strong>Quota</strong> card showing your real 5-hour / 7-day subscription utilization, read locally from Claude Code's own statusline with no network call.</td>
</tr>
<tr>
<td align="center"><strong>Config</strong></td>
<td>Model selector, tool-use confirmation mode, reasoning effort, commit/PR attribution, session retention. Per-scope permissions editor (allow/deny). Settings-history snapshots with one-click restore. Brain backup &amp; restore.</td>
</tr>
<tr>
<td align="center"><strong>Status bar</strong></td>
<td>Open Claude Code Manager from anywhere in your editor with a single click.</td>
</tr>
</table>

<br>

<table>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/02-skills.webp" alt="Skills tab" width="360"><br>
<strong>Skills</strong><br>
<sub>Global, project, and plugin skills with scope badges.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/03-commands.webp" alt="Commands tab" width="360"><br>
<strong>Commands</strong><br>
<sub>Built-in slash commands plus your custom ones from <code>.claude/commands/</code>.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/04-hooks.webp" alt="Hooks tab" width="360"><br>
<strong>Hooks</strong><br>
<sub>Inspect automation hooks across global, project, and local scopes.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/05-mcp.webp" alt="MCP servers tab" width="360"><br>
<strong>MCP Servers</strong><br>
<sub>Enable/disable, delete, or inspect MCP servers. Secrets masked automatically.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/06-agents.webp" alt="Agents tab" width="360"><br>
<strong>Agents</strong><br>
<sub>Browse project agents with Sonnet / Opus / Haiku badges.</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="https://raw.githubusercontent.com/vishalguptax/claude-code-manager/main/site/assets/screenshots/07-account.webp" alt="Account tab" width="360"><br>
<strong>Account</strong><br>
<sub>Profile switcher, activity heatmap, token stats, opt-in quota card.</sub>
</td>
</tr>
</table>

<br>

## Keyboard shortcuts

| Shortcut | Action |
| :-- | :-- |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> / <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> | Open Claude Code Manager |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> &rarr; *Claude Code Manager: Open* | Command palette fallback |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> &rarr; *Claude Code Manager: Switch Account* | Native quick-pick profile switcher |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> &rarr; *Claude Code Manager: Reload* | Full re-parse + webview re-mount |

<br>

## Configuration

Open Settings (<kbd>Ctrl</kbd>+<kbd>,</kbd>) and search **Claude Code Manager**.

| Setting | Default | What it controls |
| :-- | :-- | :-- |
| `terminal.location` | `editor` | Open resumed sessions in the editor area or the bottom panel |
| `terminal.editorPosition` | `beside` | Which editor group terminals land in |
| `sessions.defaultFilter` | `recent` | Default date filter (recent / week / month / all) |
| `sessions.defaultProject` | `current` | Default project scope (current workspace or all projects) |
| `sessions.restoreWindowMinutes` | `30` | Time window used to group terminals for **Restore Workspace** |
| `sessions.resumeIn` | `auto` | Where Resume / New / Continue opens Claude: `auto` (match the session's origin), `terminal`, `extension` (Claude Code chat tab), or `ask` (prompt each time) |
| `marketplaceSkillsUrl` | unset | Override URL for the in-panel Skills marketplace link |
| `marketplaceMcpUrl` | unset | Override URL for the in-panel MCP marketplace link |

Full reference in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

<br>

## FAQ

**Does it send anything to the network?**
No. **Zero network calls, ever.** The extension reads `~/.claude/` and renders in a VS Code webview under a strict CSP that blocks every outbound request. The Account tab's **Quota** card is local too: your 5-hour and 7-day numbers are computed by Claude Code and shown in its statusline, and an opt-in tap caches that render to a file the extension reads from disk. Claude Code Manager never calls Anthropic and never reads your OAuth token.

**How does the View button know which terminal hosts which session?**
Two passive signals, no instrumentation of Claude itself. (1) A `SessionStart` hook (auto-installed in your global `~/.claude/settings.json`, removable) records each CLI boot's `{sessionId, ppid}` into `~/.claude/.claude-manager/active-sessions.json`. The extension matches `vscode.Terminal.processId` against the recorded parent PID. (2) For VS Code terminals with shell integration, `claude --resume <id>` typed at any prompt is caught directly from the shell-execution event. cmd.exe (no shell integration) is covered by the hook path. Stale entries auto-prune after 1h or a dead PID.

**Where are saved account profiles stored?**
`~/.claude/manager-accounts/<slug>/`. Each slot holds a copy of `~/.claude.json` and `~/.claude/.credentials.json` plus a small `profile.json` with the label. These files include OAuth tokens (same plaintext format Claude CLI uses), so treat the folder as sensitive. Remove a profile and its token copy is deleted immediately.

**Does it work with Cursor / Windsurf / Antigravity / VSCodium?**
Yes. It's a standard VS Code extension. Install from the Marketplace (VS Code, Cursor, Windsurf, Antigravity) or [Open VSX](https://open-vsx.org/extension/vishalguptax/claude-manager) (VSCodium, Theia, Gitpod).

**Do I need Claude Code installed?**
Yes. Install [Claude Code](https://claude.ai/code) first. Either the CLI, the official VS Code extension, or both works. Claude Code Manager reads from the shared `~/.claude/` directory, so sessions from either surface show up together.

**Does it modify my Claude config?**
Only when you explicitly act: enable or disable an MCP server, edit a permission, restore from a backup, rename or delete a session. There's also one bootstrap write on first activation. The `SessionStart` hook that powers the View button is added to `~/.claude/settings.json`. Remove it from the Hooks tab if you'd rather not have it.

**Where does my data live?**
In `~/.claude/`, the same place Claude Code itself uses. The extension never copies, uploads, or duplicates your sessions.

<br>

## Compatibility

Works on every VS Code-based editor: **VS Code** &bull; **Cursor** &bull; **Windsurf** &bull; **Antigravity** &bull; **VSCodium** &bull; **Theia** &bull; **Codespaces** &bull; **Gitpod**

Requires VS Code 1.90+ and [Claude Code](https://claude.ai/code) installed. (On editors older than ~18 months, stay on the 1.10.x line.)

<br>

## Contributing

Bug reports and PRs are welcome. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local setup, build, and architecture. Browse [open issues](https://github.com/vishalguptax/claude-code-manager/issues), [open a new one](https://github.com/vishalguptax/claude-code-manager/issues/new), or check the [changelog](CHANGELOG.md).

**Architecture (v2):** the webview is built with [Preact](https://preactjs.com/) + [@preact/signals](https://preactjs.com/guide/v10/signals/), feature-sliced under `src/features/*/webview/`, bundled by esbuild as a tiny shell that lazy-loads one code-split chunk per feature tab. Every message between the extension host and the webview flows through a single shared protocol validated at runtime with [valibot](https://valibot.dev/), so malformed frames are rejected rather than acted on. The webview runs under a strict CSP (`default-src 'none'`, nonce-only scripts) and makes no network calls. Lint + format is [Biome](https://biomejs.dev/); 1,400+ unit tests gate every change. Upgrading from v1? See the [v1→v2 migration guide](docs/migration/v1-to-v2.md). There's nothing you need to do.

<br>

## Support

If Claude Code Manager saves you time, consider [sponsoring the project](https://github.com/sponsors/vishalguptax). Sponsorship keeps development active and the extension free for everyone.

<br>

## Disclaimer

Claude Code Manager is an independent, community-built extension. It is not affiliated with, endorsed by, or sponsored by Anthropic. *Claude* and *Claude Code* are trademarks of Anthropic, PBC, used here only to describe the files this extension reads on your machine.

<br>

<div align="center">
<sub><a href="LICENSE">Apache 2.0</a> &copy; <a href="https://vishalg.in">Vishal Gupta</a></sub>
<br>
<sub><a href="https://vishalg.in">Portfolio</a> &bull; <a href="https://github.com/vishalguptax">GitHub</a> &bull; <a href="https://www.linkedin.com/in/vishalguptax">LinkedIn</a></sub>
</div>
