# Keyword and intent map (2026-10-11)

Built only from public signals; there are no invented volumes. Evidence ranks in this order:
1. Our own Search Console impressions (see `audit.md` §5).
2. Google autocomplete breadth and modifiers: up to 9 suggestions per seed; R = "… reddit" exists, NW = "… not working", vs = number of "… vs X" suggestions.
3. Hacker News story points.
4. Store search results (Marketplace and Open VSX).
5. Who ranks top 3 on the web.

Raw data is in the session scratchpad: `research/keywords/google_autocomplete*.{json,txt,tsv}` (136 seeds plus a–z soups), `marketplace_rankings.json`, `openvsx_rankings.json`, `hn_*.json`, `github_topic_counts.tsv` and `websearch_results.txt`. I spot-checked these against the live endpoints in this session (`LOG.md`). Reddit blocked automation (HTTP 403), so the "… reddit" autocomplete suggestion stands in as a proxy for Reddit demand.

Web search gives no "People also ask" block. The FAQ questions below come from question-shaped autocomplete suggestions and Search Console queries instead.

## 1. Clusters → one target each

Difficulty means how hard the current top 3 would be to beat: L, M or H.

| # | Cluster | Primary query | Secondary | Evidence | Intent | Top 3 today (web) | Diff. | Target |
|---|---|---|---|---|---|---|---|---|
| 1 | Brand / category | claude code manager | claude code gui for vscode, claude code ui, claude code sidebar, claude code dashboard, claude code extension | Autocomplete 9 for "claude code manager" (ui, github, app, reddit…); "claude code gui" 9 (gui for vscode, gui alternative, open source); GSC: "claude code for vs code" position 2, "claude-manager" position 10 | Navigational + commercial | GitHub repos with the same name (MarkShawn2020 90★, dr5hn/ccm); claudelog | M | `/` + Marketplace displayName |
| 2 | Commands | claude code commands | slash commands list, all claude code commands, custom slash commands, commands folder | **GSC: about 45 variants, 251 impressions to /commands/ at position about 49**; autocomplete "slash commands" 9 (cheat sheet, list, vs skills) | Informational | code.claude.com/docs/en/commands; cheat-sheet blogs | H | `/commands/` (rendered list of all 52 built-ins plus custom commands) |
| 3 | Usage tracker | claude code usage tracker | token usage tracker, claude quota tracker, usage dashboard, usage monitor, token usage extension | GSC: "claude code usage" 28 impressions at position 31.6, "token usage tracker" position 9.8, "quota tracker" position 10; autocomplete "usage tracker" → extension, vscode, github (R); HN Usage Monitor 245 points | Commercial | Marketplace listings (growthjack), ccusage, Claude-Code-Usage-Monitor | M | `/usage/` |
| 4 | Usage limits explained | claude code usage limits | 5 hour limit, weekly limit, how to check claude code usage, usage limit reached | Autocomplete: "5 hour limit" 9 (reset, explained), "weekly limit" 9 (R); HN weekly limits 609 points, Register 331 points, 17% cut 67 points | Informational | datacamp.com tutorial, claude.ai artifact, simplilearn | M | `/guides/claude-code-usage-limits/` |
| 5 | Session manager | claude code session manager | session history viewer, search claude code conversations, session browser, resume session in vscode | Autocomplete "session" soup: browser, explorer, viewer, manager gui, search; "resume … in vscode"; GSC: "how to fork claude code session" position 11 | Commercial | x-cmd cookbook, Medium history-viewer post, code.claude.com sessions | M | `/sessions/` |
| 6 | Where history lives / lost sessions | where are claude code sessions stored | conversation history location, history disappeared, find old claude code session, export session | Autocomplete: "conversation history" 9 (location, missing, disappeared), "how to find old claude code session" 10, "history disappeared", "export … to markdown" | Informational | code.claude.com docs, blogs | M | `/guides/claude-code-session-history/` |
| 7 | Accounts | claude code switch account | multiple accounts, account switcher, change account vscode, switch account mid session | GSC: "switching between claude accounts" position 2, "claude cli switch account" 11, "cswap claude" 10; autocomplete "switch account" 9 (R, NW) | Commercial / informational | github.com/realiti4/claude-swap, pypi claude-swap ×2 | M | `/accounts/` |
| 8 | MCP manager | claude code mcp manager | mcp manager gui, claude code mcp list | Weak autocomplete (2) but adjacent "mcp manager" 9 (gui, best); GSC /mcp/ position 4.8 | Commercial | mintlify, claudelog, glama | M | `/mcp/` |
| 9 | Disable MCP | how to disable mcp server in claude code | claude code disable mcp tools, remove mcp server, mcp disable globally/for project | Autocomplete "claude code disable mcp" (server, tools, globally, for project); a–z soup "mcp disable", "mcp enable" | Informational | docs and blogs | L–M | `/guides/disable-mcp-server-claude-code/` |
| 10 | Hooks | claude code hooks | hooks examples, hook events list, hooks reference | Autocomplete 9 (examples, docs, list; R, NW); GSC /hooks/ 40 impressions at position 22 | Informational / commercial | code.claude.com hooks + hooks-guide, substack | H | `/hooks/` (renders the 33 events the editor knows) |
| 11 | Skills | claude code skills manager | skills marketplace, skills in vscode | Autocomplete "claude code skills" 9 (vs 9, best 9) | Commercial | datanorth, olostep, mintlify | H for the head term, M for "manager" | `/skills/` |
| 12 | Subagents | claude code subagents manager | claude code agents view | Autocomplete 9; HN subagents 288 points | Commercial | docs | H / M | `/agents/` |
| 13 | Plugins | claude code plugins manager | plugin marketplace vscode, plugins list | Autocomplete "plugin marketplace" 9 incl. "…vscode"; GitHub topic `claude-code-plugin` 9.3k repos | Commercial | docs, marketplaces | M | `/plugins/` (new) |
| 14 | Checkpoints | claude code checkpoints | rewind, checkpoint restore, restore file claude changed | Autocomplete "checkpoints/rewind" (restore, rewind not working) | Informational / commercial | docs | M | `/checkpoints/` (new) |
| 15 | Prompt history | claude code prompt history | search past prompts, history.jsonl | Autocomplete "search past conversations", "prompt history" | Commercial | — | L | `/prompts/` (new) |
| 16 | Memory | claude code memory viewer | auto memory, memory location | Autocomplete "claude code memory" 9 (location, memory bank) | Informational / commercial | docs | M | `/memory/` (new) |
| 17 | Settings | claude code settings in vs code | settings.json editor, permissions allow/deny | Autocomplete "claude code settings" (settings.json example, settings in vs code, config file location) | Commercial | docs | M | `/config/` (new) |
| 18 | The .claude folder | claude code config file location | ~/.claude folder explained, where is claude code settings.json | Autocomplete "config file location", "memory location", "history location" | Informational | docs | M | `/guides/claude-code-folder/` (new) |
| 19 | Cursor | claude code in cursor | claude code extension cursor, not showing in cursor | Autocomplete "claude code extension" soup repeats cursor; "in cursor reddit" | Informational | datacamp (×8 localised), morphllm | M | `/editors/cursor/` |
| 20 | Antigravity | claude code antigravity | claude code extension for antigravity | Autocomplete "antigravity extension", "setup" | Informational | blogs | L–M | `/editors/antigravity/` |
| 21 | Windsurf | claude code windsurf | windsurf extension | Autocomplete 9 | Informational | blogs | L–M | `/editors/windsurf/` |
| 22 | Kiro, VSCodium, Open VSX | claude code kiro | claude code vscodium, open vsx | Kiro 9 (plugin, ide); VSCodium and Open VSX weak (1–2), **but Open VSX carries 96% of CCM downloads** | Informational | blogs | L | `/editors/kiro/`, `/editors/vscodium/` |
| 23 | Editors hub | claude code vs code extension for forks | which editors | — | Navigational | — | — | `/editors/` (hub, links only) |
| 24 | vs ccusage | ccusage alternative | ccusage vscode, ccusage gui | ccusage autocomplete 9 (R, NW); "ccusage alternative" returns nothing (weak); HN ccusage 75 points; ccusage 18.9k★, 234k npm/week | Commercial | claudelog FAQ, mintlify, lilys | M | `/compare/ccusage/` |
| 25 | vs claude-swap | claude-swap alternative | claude code account switcher | "claude-swap" 9 (github, install, reddit); 3.3k★ | Commercial | GitHub, PyPI | M | `/compare/claude-swap/` |
| 26 | vs official extension | claude code extension vs | claude code vscode extension features | Autocomplete "claude code vscode" vs:10; "extension vs cli" | Commercial | code.claude.com | H for their brand, M for the comparison | `/compare/claude-code-extension/` (complementary, said plainly) |
| 27 | GUI alternatives | claude code gui alternatives | claudia, opcode, claude code ui | "claude code gui" vs:5, "gui alternative", "claudia" 9 | Commercial | claudelog (claudia), github winfunc/opcode | M | `/compare/claude-code-gui/` |
| 28 | Changelog | claude code manager changelog | release notes | — | Navigational | — | L | `/changelog/` |

## 2. Top 30 queries, ranked by evidence

1. claude code commands (GSC 41 impressions + 44 variants)
2. claude code usage (GSC 28; autocomplete 9 R)
3. claude code usage tracker (autocomplete extension/vscode; GSC)
4. claude code slash commands (GSC 12; autocomplete)
5. claude code custom commands (GSC 10)
6. claude code weekly limit (HN 609 points; autocomplete R)
7. claude code 5 hour limit (autocomplete R)
8. claude code token usage tracker (GSC position 9.8)
9. claude quota tracker (GSC position 10)
10. claude code switch account (autocomplete R/NW; GSC position 2 for a variant)
11. claude code multiple accounts (autocomplete R)
12. claude code session history (autocomplete 9)
13. where are claude code sessions stored (autocomplete 7)
14. claude code session manager (autocomplete 9)
15. claude code history viewer (a–z soup)
16. claude code hooks (autocomplete R/NW; GSC 40 impressions)
17. claude code gui (autocomplete 9; a–z 206)
18. claude code manager (brand; autocomplete 9)
19. claude code mcp (autocomplete 9, R/NW)
20. claude code disable mcp server (autocomplete)
21. ccusage (autocomplete R/NW)
22. claude code in cursor (autocomplete)
23. claude code antigravity (autocomplete)
24. claude code skills (autocomplete vs 9, best 9)
25. claude code plugins marketplace vscode (autocomplete)
26. claude code checkpoints / rewind (autocomplete)
27. claude code subagents (HN 288 points)
28. claude code settings in vs code (autocomplete)
29. claude code memory location (autocomplete)
30. claude-swap (autocomplete 9)

## 3. Cannibalisation check

Every primary query in §1 is unique. Pairs that sit close together are split by intent:

| Pair | Split |
|---|---|
| `/usage/` and `/guides/claude-code-usage-limits/` | The tool ("tracker", commercial) vs the explanation ("limits", "5 hour", informational). The guide links to /usage/ once, as the place to see your own numbers. |
| `/sessions/` and `/guides/claude-code-session-history/` | The tool ("session manager", "viewer") vs file location and recovery ("where stored", "disappeared"). |
| `/mcp/` and `/guides/disable-mcp-server-claude-code/` | The manager vs the how-to (CLI and settings steps first, the GUI as one option). |
| `/config/` and `/guides/claude-code-folder/` | Editing settings vs a map of every file Claude Code keeps. |
| `/accounts/` and `/compare/claude-swap/` | "switch account" vs "claude-swap alternative". |
| `/` and `/compare/claude-code-gui/` | Brand vs "gui alternatives". The home page `<title>` leads with the brand. |

Titles are checked for uniqueness by a test in the site build.

## 4. What has spread recently (HN, dev.to, press)

Reddit and X could not be read by automation.

| # | Item | Engagement | Why it spread |
|---|---|---|---|
| 1 | HN "Claude Code weekly rate limits", 2025-07-28 (https://news.ycombinator.com/item?id=44713757) | 609 points / 705 comments | A pricing change that hit every user |
| 2 | HN, The Register, "Claude Code users hitting usage limits 'way faster than expected'", 2026-03-31 (item 47586176) | 331 / 224 | Press amplified a Reddit complaint |
| 3 | HN "Claude Code May–August 2026 weekly limits promotion", 2026-08-18 (item 49348751) | 295 / 267 | Limits changed again |
| 4 | HN "Claude Code reduces its weekly limit by 17%", 2026-08-31 | 67 / 52 | Limits cut, announced on X |
| 5 | Show HN: Claude Code Usage Monitor, 2025-06-19 | 245 / 135 | A tool for limit anxiety, launched at the moment of pain |
| 6 | "Portal by Spotify cut my Claude Code token usage by 90%", 2026-09-04 | 278 / 178 | Big name plus a savings claim |
| 7 | Show HN: Rudel, Claude Code session analytics, 2026-03-12 | 144 / 86 | Visibility into what sessions did |
| 8 | Show HN: Agent-of-empires session manager, 2026-01-12 | 118 / 44 | Managing many sessions |
| 9 | dev.to "Adding Persistent Memory to Claude Code with claude-mem", 2026-04-13 | 39 reactions / 26 comments | Memory is a recurring pain |

Grounded hook ideas, each backed by `facts.md`:
1. **"Your 5-hour and weekly limits, in the status bar, with no network call."** Reads Claude Code's own statusline cache (v2.16.0). This rides the limit news cycle.
2. **"Every session you ran last month is a file on your disk. Search it."** Full-text transcript search plus resume on the right branch.
3. **"Two Claude accounts, no /logout."** Profile switching, honest about where tokens live.
4. **"See every file Claude changed, and put any version back."** Checkpoints diff and restore.
5. **"One sidebar for everything in ~/.claude"**: the 12 tabs, for people who otherwise run ccusage, a switcher and a JSON editor separately.

## 5. Store keywords (package.json, max 30)

Marketplace ranking keys on display-name tokens first, so tags are secondary. Weak tags to replace (no store or Google evidence):
- `claude-manager`: the old name; nobody searches it.
- `claude config`
- `vscode extension`: every extension is one.
- `claude code cli`
- `developer-tools`
- `session manager`: duplicates `claude session manager`.

Candidates with evidence:
- `claude code usage`: leaders use it; CCM is absent from the Marketplace top 50.
- `claude code history`: agsoft ranks with it; CCM is absent.
- `claude code sessions`
- `quota`
- `claude code plugins`
- `checkpoints`

The full proposal is in `PLAN.md` E.
