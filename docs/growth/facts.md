# Fact sheet: Claude Code Manager

Every claim on the site, the listings and the launch drafts must trace to a line here. Each line gives a source: a `path:line` in this repo (branch `growth/seo`, cut from `origin/main` @ 943eae0) or a URL with the date it was read. If something is not here, it does not go on a page.

Read 2026-10-11.

## Product summary

Claude Code Manager is a free, Apache-2.0 VS Code extension (`vishalguptax.claude-manager`, v2.18.0) that reads the files Claude Code keeps on disk (`~/.claude/`, `~/.claude.json` and the project's `.claude/`). It turns them into a sidebar with 12 tabs: Sessions, Account (usage, quota and account switching), Config, Checkpoints, Prompts, Skills, MCP, Agents, Commands, Hooks, Plugins and Memory. It works alongside the Claude Code CLI and Anthropic's official Claude Code extension. Sessions from both appear in one list, and Resume opens a session in a terminal or in the official extension's chat. It has no network client. It reads and writes local files and launches the `claude` CLI in a terminal when you ask it to. Sources: `package.json:2-5,24,263-276`; `README.md:8,71`; `src/core/config.ts:26-271`; network audit below.

## Identity and distribution

| Fact | Value | Source |
|---|---|---|
| Display name | Claude Code Manager — Sessions, Usage, MCP & Agents | `package.json:3` |
| Extension ID (frozen) | `vishalguptax.claude-manager` | `package.json:2,7`; memory: stable-identifiers-no-rename |
| Version | 2.18.0, released 2026-10-03 | `package.json:5`; `CHANGELOG.md:3`; Marketplace API `versions[0]` = 2.18.0; Open VSX API `version` = 2.18.0 |
| Licence | Apache-2.0 | `LICENSE:1-2`; `package.json:12` |
| Price | Free | `package.json:39` (`"pricing": "Free"`) |
| Engine | VS Code ^1.90.0, Node ≥20 | `package.json:25-28` |
| Marketplace categories | AI, Machine Learning, Visualization | `package.json:30-34` |
| Keywords | 30 entries (the Marketplace maximum) | `package.json:40-71` |
| Published on Marketplace since | 2026-04-10 | Marketplace API `publishedDate` (read 2026-10-11) |
| GitHub repo created | 2026-04-07 | `gh api repos/vishalguptax/claude-code-manager` |
| Install sources | VS Code Marketplace and Open VSX (published by the same release workflow) | `.github/workflows/release.yml:40,109-110` |
| Author | Vishal Gupta (https://vishalg.in) | `package.json:8-11`; `README.md:298` |
| Not affiliated with Anthropic | "independent, community-built extension. It is not affiliated with, endorsed by, or sponsored by Anthropic" | `README.md:293` |

## Numbers (2026-10-11)

| Number | Value | Source | On the site |
|---|---|---|---|
| Marketplace installs | 2,351 | Marketplace extensionquery API, statistic `install` | Baked at build into the combined count |
| Open VSX downloads | 64,630 | `https://open-vsx.org/api/vishalguptax/claude-manager` `downloadCount` | Baked at build into the combined count |
| Combined | 66,981 | sum of the two | Must be labelled "downloads", never "developers" or "users". The two stores count differently, and Open VSX counts update downloads. |
| Marketplace rating | 5.0 from 3 ratings | Marketplace API `averagerating=5`, `ratingcount=3` | Show the count next to the rating, or don't show it |
| Open VSX rating | 5 from 1 review | Open VSX API | — |
| GitHub stars | 32 | GitHub API `stargazers_count` | Baked |
| Unit tests | 321 test files, 4,472 tests passing | `pnpm test` on 943eae0 (this session) | README says "3,600+" (`README.md:281`), which is out of date |

## Feature inventory

Commands: `package.json:111-139`, registered in `src/extension/extension.ts:186-236`. Settings: `package.json:159-315`.

| Feature | What the user can do | Source | Site page today |
|---|---|---|---|
| Sessions | Browse every Claude Code session by project and git branch. Full-text transcript search. Resume, continue, fork, new and temporary sessions. Pin, archive, rename, soft-delete (transcripts on disk untouched), bulk select. Export as .jsonl, bulk .zip, or copy as Markdown. Import .jsonl/.zip. Restore several recent sessions at once. View the terminal running a session. Recreate a missing worktree and resume. | `src/features/sessions/messageHandlers.ts:408-703`; `commands.ts:54-151,189-193,345-347,546,646-795` | /sessions/ |
| Branch check on resume | If the session's branch differs from yours, it warns you and offers `git checkout`, "Resume Anyway", or opening the worktree where the branch is live | `src/features/sessions/commands.ts:329-420` | /sessions/ |
| Resume target | `claudeManager.sessions.resumeIn`: auto (matches where the session started), terminal, extension, ask | `package.json:315` | /sessions/ |
| Usage | Tokens, sessions, messages and cache reads over 7 days, 30 days and all time. Per-model, per-project, per-tool and per-MCP-server breakdowns. Activity heatmap. Cost shown as "what these tokens would cost at public API rates", from a static price table: an estimate, not your bill. | `src/features/account/webview/ui/UsageView/UsageView.tsx:202-215,369-381,436-519`; `src/core/pricing.ts:1-52` | /usage/ |
| Quota | Opt-in. Shows the 5-hour window and 7-day window (with weekly pace), spend limit (gateway only), and live session context, cost and model. Status bar reads `5h 72% · 7d 40%`. Data comes from Claude Code's own statusline JSON, cached to `~/.claude/.claude-manager/statusline.json` by a tap you enable, which writes `statusLine.command` into `~/.claude/settings.json`. Figures are as fresh as Claude Code's last statusline render. | `src/features/account/quota.ts:1-19,72-113,141,181-200`; `statuslineTap.ts:1-19,131-136`; `statuslineInstall.ts:1-26`; `quotaStatusBar.ts:1-3,150`; `docs/releases/v2.16.0.md` | /usage/ |
| Account switching | Save the signed-in Claude account as a profile and switch between profiles without `/logout` + `/login`. Only `oauthAccount`/`userID` in `~/.claude.json` and the `claudeAiOauth` credential entry are swapped. Credentials come from the macOS Keychain or `~/.claude/.credentials.json`. Profiles are stored at `~/.claude/manager-accounts/<slug>/`, including a **plaintext copy of the OAuth tokens**, and the extension warns about this once when you save the first profile. Native quick pick: "Claude Code Manager: Switch Account". | `src/features/account/profiles.ts:1-44,757-765,1203-1258`; `credentials.ts:226,526-575`; `accountHandlers.ts:118-136`; `package.json:115`; `README.md:253` | /accounts/ |
| MCP servers | List servers from every source (ancestor `.mcp.json` files, `~/.claude.json`, plugins, legacy `~/.claude/mcp.json`). Enable, disable, add, edit, delete. Secrets are masked. A banner flags servers that need re-authentication (`mcp-needs-auth-cache.json`). Runs `claude mcp login/logout/list` in a terminal. Add from a bundled catalog of 16 servers (the list ships with the extension and is not fetched). | `src/features/mcp/parser.ts:51-401,572,677-982`; `messageHandlers.ts:161-295`; `webview/lib/catalog.ts:1-193`; `docs/releases/v2.17.0.md` | /mcp/ |
| Skills | Global (`~/.claude/skills`), project (`.claude/skills`), claude.ai-synced and plugin skills, each with a scope badge. Open, view detail, delete (with confirmation), launch Claude with a skill. No "create" action. | `src/features/skills/parser.ts:26,193-235`; `src/features/sessions/featureHandlers.ts:81-135` | /skills/ |
| Commands | 52 built-in slash commands, each with its description, plus custom commands from `~/.claude/commands` and `.claude/commands` and plugin commands. Open the file, or launch a command into Claude Code. | `src/features/commands/parser.ts:17-78,227`; `commands/messageHandlers.ts:72,91` | /commands/ |
| Hooks | Hooks from user, project and local settings. Toggle (a disabled hook is parked under `_disabled_hooks`), edit, delete, add with a wizard (scope → event → matcher → command), open `/hooks`. The editor knows 33 hook events. | `src/features/hooks/parser.ts:171-185`; `writer.ts:50,171`; `featureHandlers.ts:162-320`; `events.ts:108+` | /hooks/ |
| Agents | Subagents from `~/.claude/agents`, `.claude/agents` and plugins, with model badges. Create, edit, duplicate, delete. | `src/features/agents/parser.ts:25,152`; `writer.ts:104-170`; `messageHandlers.ts:95-145` | /agents/ |
| Plugins | Installed plugins and their state per scope. Flags disagreements (an enabled plugin from a disallowed marketplace, a settings entry with nothing installed). Enable or disable per scope. Browse added marketplaces and install with `claude plugin install <id> --scope <s>` in a terminal. | `src/core/plugins.ts:90-91,294`; `src/features/plugins/state.ts:117-163`; `messageHandlers.ts:86-158`; `README.md:114` | none |
| Checkpoints | Files Claude Code backed up in `~/.claude/file-history/<sessionId>/`. Diff any version against disk, or restore it (with confirmation). | `src/features/checkpoints/parser.ts:148-150,515-526`; `commands.ts:120-290`; `README.md:90` | none |
| Prompts | Full-text search over every prompt in `~/.claude/history.jsonl`, across projects. Retried prompts collapse into one row. Copy a prompt or open the session it came from. | `src/features/prompts/parser.ts:221`; `messageHandlers.ts:107-112`; `README.md:94` | none |
| Memory | Claude Code's auto-memory per project (`~/.claude/projects/<slug>/memory/*.md`). Browse, search, open, delete, with broken-link and orphan detection. | `src/features/memory/parser.ts:74,393-418,547-549`; `README.md:122` | none |
| Config | Model, effort, thinking, output style, permission mode, sandbox, allow/deny rules, additional directories, attribution, cleanup period, auto-compact, checkpointing, auto-memory, at user/project/local scope. Settings snapshots before every write, with restore. | `src/features/sessions/settingsHandlers.ts:89-384`; `src/features/config/webview/ui/*`; `src/features/account/snapshots.ts:1-73` | home section only |
| Brain export/import | Zip your CLAUDE.md, settings, skills, commands, agents, memory and global MCP servers, then import them on another machine with a conflict preview. | `src/features/brain/exporter.ts:28-125`; `importer.ts:80-275`; `package.json:119-123` | none |
| Diagnostics | "Run Diagnostics" (checks `claude --version` and that `~/.claude` is readable, plus Keychain state). "Report a Problem" opens a prefilled GitHub issue in the browser. | `src/features/diagnostics/runner.ts:76-322`; `commands.ts:140-175` | none |
| Open it | Ctrl/Cmd+Alt+C, the status bar item, or the command palette ("Claude Code Manager: Open"). Secondary sidebar on VS Code 1.106+. | `package.json:145-147,83-90`; `src/extension/secondarySidebar.ts:1-35`; `README.md:57-63` | home |
| Tabs | Hide and reorder any of the 12 tabs | `package.json:259-281` | — |

## Supported editors and platforms

| Editor | What we can claim | Source | Notes |
|---|---|---|---|
| VS Code 1.90+ | Supported | `package.json:26` | The secondary sidebar needs 1.106+ (`src/extension/secondarySidebar.ts`) |
| Cursor, Windsurf | "Works in" (README claim). Code also builds the resume deep link with the editor's own URI scheme for Cursor, Windsurf and Insiders. | `README.md:35,45,255`; `src/extension/claudeCodeExtension.ts:75-85,166-173` | Registry each editor uses: see the facts-ext research |
| Antigravity, VSCodium, Theia, Codespaces, Gitpod | "Works in" (README claim only; no editor-specific code) | `README.md:35,47,271` | Say "installs from Open VSX" only where the editor's docs confirm it |
| OS | macOS (Keychain via `/usr/bin/security`), Windows (`.credentials.json`, `reg.exe` policy keys, PowerShell), Linux (`.credentials.json`, `/proc`) | `src/features/account/credentials.ts:54-68,226,526-628`; `src/core/managedSettings.ts:301-370`; `src/features/sessions/procTime.ts:145-195` | |
| Requires Claude Code | Yes: the CLI, the official extension, or both | `README.md:258-259` | |
| Honours `CLAUDE_CONFIG_DIR` | Yes | `src/core/config.ts:26`; `src/core/claudeHome.ts:5-19,90-116` | Useful for multi-profile setups |

## Privacy and network behaviour (exact claims and how they check out)

| Claim | Where | Verdict | Evidence |
|---|---|---|---|
| "100% local, zero telemetry" | `package.json:4` | **True.** No analytics or telemetry code; no network client. | `grep -rnE "\bfetch\(|node:https?|XMLHttpRequest|new WebSocket" src` → no matches outside tests (2026-10-11) |
| "Zero network calls, ever" | `README.md:41,218`; site FAQ | **True for the extension's own code.** It launches the `claude` CLI in a terminal on request (`/login`, `claude mcp login`, `claude plugin install`), and that CLI uses the network. | `src/features/mcp/messageHandlers.ts:276-295`; `src/features/plugins/commands.ts:102`; `src/features/sessions/accountSwitcher.ts:344` |
| "renders … under a strict CSP that blocks every outbound request" | `README.md:218` | **Overstated.** `connect-src 'none'`, but `img-src` allows `https:`. No code loads remote images. | `src/extension/html.ts:17-22` |
| "never reads your OAuth token" / "never touches your OAuth token" | `README.md:218`; `site/index.html` FAQ and privacy cards; `site/llms.txt` | **False for account switching.** Saving a profile reads the token and copies it, in plaintext, to `~/.claude/manager-accounts/`. The JWT is decoded locally. Quota does not use the token. | `src/features/account/profiles.ts:1-44,378-404,757-765` |
| "stores no credentials" | `site/llms.txt` | **False.** See the row above. | same |
| Safe wording for the site | — | "No telemetry. No network client. Your tokens never leave your machine. The Quota card reads Claude Code's own statusline cache from disk and never uses your token. Account profiles keep a local copy of each login's tokens in `~/.claude/manager-accounts/` (plaintext, as Claude Code itself stores them on Linux and Windows)." | `credentials.ts:526-538` |
| "Nothing is written to that file just because the sidebar was opened" | `README.md:262` | True per the opt-in tap and hook code | `statuslineInstall.ts:1-26`; `sessionTapInstall.ts:96-130` |
| Delete doesn't touch Claude's data | `commands.ts:192` | True: soft hide. Exception: temporary sessions really delete their transcript on terminal close. | `ephemeralSession.ts:131,187-189` |

## Pricing and licence

- Free. Apache-2.0 (`LICENSE`). GitHub Sponsors: `package.json` `sponsor.url` = https://github.com/sponsors/vishalguptax.

## Things that do not exist (never put these on a page)

- No testimonials, company logos, press mentions or benchmarks.
- No user count. Downloads are not users.
- No web, desktop or JetBrains version. VS Code-family editors only.
- Not posted to Hacker News (Algolia: 0 hits for claudecodemanager, vishalguptax and the repo URL, 2026-10-11).
- No "create skill" action. Commands are read-only apart from launching them.
- Cost figures are estimates at public API rates, not billing data.
- Quota needs the opt-in statusline tap and at least one Claude Code turn after enabling it.

## External facts (official sources, read 2026-10-11; each re-fetched and quoted in this session)

| Fact | Source |
|---|---|
| Transcripts: `~/.claude/projects/<project>/<session-id>.jsonl`; `<project>` is the working directory with non-alphanumerics replaced by `-`; "The entry format is internal to Claude Code and changes between versions" | https://code.claude.com/docs/en/sessions |
| `cleanupPeriodDays`: default `30`, minimum `1`; "The sweep deletes transcripts without showing a message" | https://code.claude.com/docs/en/settings-reference (#cleanupperioddays) |
| `--continue` reopens the most recent session in the directory; `--resume` opens the picker; `--fork-session` creates a new session ID | https://code.claude.com/docs/en/sessions, /cli-reference (research notes) |
| "Both Pro and Max plans have a five-hour session limit and a weekly limit. Max plans also have a separate weekly limit for Fable." Limits are shared across Claude and Claude Code. "Monitor your remaining allocation using the /status command." | https://support.claude.com/en/articles/11145838 |
| Statusline JSON includes `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage` (0–100) and `resets_at` (Unix epoch). It appears "only for claude.ai Pro and Max subscribers, or behind a Claude apps gateway that sets a spend limit…, and only after the first API response in the session" | https://code.claude.com/docs/en/statusline |
| MCP: "Toggle a server off in the /mcp panel to stop Claude Code from connecting to it without losing its configuration." `disabledMcpServers`/`enabledMcpServers` "are unrelated to enabledMcpjsonServers and disabledMcpjsonServers, which control approval of servers defined in a project's .mcp.json" | https://code.claude.com/docs/en/mcp |
| "Custom commands have been merged into skills." `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy`; existing commands keep working | https://code.claude.com/docs/en/skills |
| "Checkpointing does not track files modified by Bash commands"; `/rewind` or Esc Esc | https://code.claude.com/docs/en/checkpointing |
| Multiple accounts: "give each account its own configuration directory" with `CLAUDE_CONFIG_DIR` | https://code.claude.com/docs/en/authentication |
| Official extension: Session history (keyword search, resume), `/usage` Account & usage dialog, Customize section (MCP servers, commands, hooks, memory, permissions, plugins); "also installs in other VS Code forks like Devin Desktop or Kiro… or install from the Open VSX registry" | https://code.claude.com/docs/en/vs-code |
| Cursor: "Cursor uses the Open VSX extension registry for third-party extensions" | https://cursor.com/help/customization/extensions.md |
| Windsurf is now Devin Desktop: "The desktop application name is changing from Windsurf to Devin"; "By default, Devin Desktop downloads extensions from an Open VSX mirror" | https://docs.devin.ai/desktop/devin-desktop-faq.md; https://docs.devin.ai/desktop/advanced.md |
| Kiro: "By default, Kiro uses the IDE extension marketplace at https://open-vsx.org" | https://kiro.dev/docs/ide/editor/extension-registry/ |
| VSCodium: "the Open VSX Registry is the pre-set extension gallery in VSCodium" | https://github.com/VSCodium/vscodium/blob/master/docs/extensions.md |
| Gitpod (Ona): "For VS Code Browser, we use the Open VSX registry" | https://ona.com/docs/classic/user/references/ides-and-editors/vscode-extensions.md (research notes; not re-fetched) |
| Antigravity's registry: **unverified** (no official doc found). It is not named in Claude Code docs. → no dedicated page; covered on /editors/ with what is known | facts-ext research |
| Deep links: CCM builds them from `vscode.env.uriScheme`, so a Resume into the official extension's chat returns to the editor you are in (Cursor, Windsurf/Devin, Insiders…) | `src/extension/claudeCodeExtension.ts:75-85,166-173` |
