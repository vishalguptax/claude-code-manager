# Launch kit: drafts and rules (nothing has been posted or submitted)

All rules were read 2026-10-11 (raw notes are in the session scratchpad: `research/distribution/`). Every claim in these drafts traces to `facts.md`. **Never post, submit, comment, star or fork on the owner's behalf.**

Marked **OWNER WRITES THIS**: the venue bans AI-written or AI-submitted text. For those, this file gives the facts and the required format only; the owner writes the words.

Before anything goes out, check:
- **Name clash.** Three other projects use the name: dr5hn/ccm "CCM (Claude Code Manager)", ldlework's "Show HN: Claude Code Manager" (2026-04-24, 11 points), and Product Hunt's `/products/claude-manager` (a terminal UI). Always say "Claude Code Manager, a VS Code extension" and never "CCM".
- **The official extension overlaps.** Anthropic's extension now has session history, `/usage` and a Customize panel. Lead with what is distinct (see `/compare/claude-code-extension/`): one sidebar for every file Claude Code keeps, account profiles, checkpoint diff/restore, prompt search, memory, settings snapshots, and limits in the status bar.

---

## 1. Curated lists

| List | Stars / last push | Submit how | Section | Rules (quoted) | Earliest | Status |
|---|---|---|---|---|---|---|
| **hesreallyhim/awesome-claude-code** — **OWNER WRITES THIS** | 55,381 / 2026-10-10 | Web issue form only: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml | "Observability & Monitoring > Usage & Cost", "Session Monitors", or "Configuration" (there is no IDE category) | "resource recommendations must be created by human beings"; "It is **not** possible to submit… using the `gh` CLI"; "You may not recommend more than one resource at a time"; descriptions "not a sales pitch… one line… no emojis"; eligibility "at least 14 days old… active development… OR… 100 stars" | Now (repo created 2026-04-07, active) | Not listed |
| viatsko/awesome-vscode | 29,108 / 2026-06-21 | PR (template: name, why, screenshot, ToC) | Productivity | "Use the link from marketplace.visualstudio.com…"; "alphabetical order"; the maintainer removed "low-traction extensions" on 2026-06-21 | — | **PR #503 already open** (2026-07-03). Don't open another; an owner comment on #503 with fresh numbers is optional. |
| ai-for-developers/awesome-ai-coding-tools | 2,149 / 2026-09-18 | PR | Developer Productivity Tools | "Add your tool to the **end of the relevant section**"; tools must be "AI-powered or AI-enhanced" and have "at least a free tier" | Now, **if** the owner judges that a Claude Code companion counts as AI-enhanced | Not listed |
| jamesmurdza/awesome-ai-devtools | 3,958 / 2026-08-27 | PR (template) | "Usage Analytics & Cost Tracking" or "Configuration & Context Management" | Checklist "The entry is a tool that uses AI"; recent outside PRs were closed unmerged | Low odds | Not listed |
| jqueryscript/awesome-claude-code | 526 / 2026-10-07 | No CONTRIBUTING; the maintainer adds entries in bulk, and outside PRs were closed (#732) | IDE & Editor Integrations | — | Skip | Not listed |
| travisvn/awesome-claude-skills — **OWNER WRITES THIS** | 15,351 / 2026-04-28 | PR | "Tools" (weak fit; the list is about skills) | "the PR not be explicitly generated / submitted with AI-assistance… closed without comment"; "10 stars"; "One item per PR" | Low priority | Not listed |
| punkpeye, wong2, appcypher awesome-mcp-servers | — | — | Doesn't fit: those lists take MCP *servers*, and appcypher's is archived | — | — | Skip |

No list specific to Open VSX, Cursor or Windsurf extensions was found.

**Facts for the owner's awesome-claude-code form** (their words, not these):
- Display name: Claude Code Manager.
- Link: https://github.com/vishalguptax/claude-code-manager.
- Author: Vishal Gupta, https://github.com/vishalguptax.
- What it does, as facts: a VS Code extension (also on Open VSX) that reads `~/.claude/` and shows sessions (full-text search, resume, fork), token usage and 5-hour/weekly limits, account profiles, MCP servers, skills, commands, hooks, agents, plugins, checkpoints, prompt history and memory. No network client, no telemetry, Apache-2.0.
- Format: one line, a description rather than a pitch, no emojis.

**Draft entry for ai-for-developers/awesome-ai-coding-tools** (format `- **[Tool Name](url)** – One-line description`):

```
- **[Claude Code Manager](https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager)** – VS Code sidebar for Claude Code: search and resume sessions, see token usage and 5-hour/weekly limits, switch accounts, and manage MCP servers, skills and hooks. Local only, open source.
```

---

## 2. Venues

| Venue | Rules (quoted, with source) | Already posted? | Fit |
|---|---|---|---|
| **Show HN** — **OWNER WRITES THIS** | https://news.ycombinator.com/showhn.html: "something you've made that other people can play with"; "Don't post quickly-generated one-offs". Guidelines: "Don't post generated text or AI-edited text"; "please don't automate posting". Reposts: "If a story has not had significant attention in the last year or so, a small number of reposts is ok." | No (HN Algolia: 0 hits for the repo, the site or the publisher) | Good. Limit anxiety is a recurring HN topic (weekly limits 609 points; Usage Monitor Show HN 245). |
| r/ClaudeAI | Showcase posts need "total karma>=50", otherwise use the "Built with Claude Project Showcase Megathread" under Rule 7. I could not read the text of Rule 7 (Reddit blocked automation). | Unknown | Good. Read Rule 7 by hand first. |
| r/ClaudeCode | Not verified (blocked). A third-party tool suggests flair is required ("Showcase"). | Unknown | Good |
| r/vscode, r/cursor, r/SideProject | Not verified (blocked) | Unknown | r/cursor: lead with Open VSX availability |
| dev.to — **OWNER WRITES THIS** | https://dev.to/guidelines-for-ai-assisted-articles-on-dev: AI-assisted posts must disclose it, and must not "Promote any business, program, or course (including your own)" | `marketing/manual/02-devto-article.md` exists, unpublished | A tutorial angle only, human-written |
| Product Hunt | https://help.producthunt.com/en/articles/479557-how-to-post-a-product: "Company accounts cannot hunt or post products"; "a scheduled post goes live at 12:01 AM PST" | No launch. `/products/claude-code-manager` is free; `/products/claude-manager` is someone else's. | Possible. Comparable Claude Code tools got 140–149 upvotes (third-party data). |
| X, LinkedIn | No rules; norm: say you made it, show a demo | — | Good, with the 59-second tour video |

**Timing:** the only cited time is Product Hunt's day start at 12:01 AM PT. For HN and Reddit I found no reliable source, so no time is recommended. A natural hook is the next Claude Code limits news cycle (see `keywords.md` §4).

---

## 3. Drafts

All of these come from facts only. Replace the bracketed numbers with the live ones on the day; the site's footer shows them.

### r/ClaudeCode or r/ClaudeAI (check Rule 7 and flair first)

**Title:** I built a VS Code sidebar that shows your Claude Code 5-hour and weekly limits, sessions and MCP servers, without any network calls

**Body:**

> Claude Code keeps a lot on disk: every transcript in `~/.claude/projects`, every prompt in `history.jsonl`, backups of every file it edits, plus settings, skills, agents and plugins. I kept losing track of it, so I made Claude Code Manager, a free VS Code extension (also on Open VSX for Cursor, Kiro, VSCodium and Devin Desktop) that turns that folder into 12 tabs.
>
> The parts people seem to use most:
> - **Limits in the status bar** (`5h 72% · 7d 40%`). It reads the `rate_limits` data Claude Code already hands its statusline, cached to a local file. No API calls, no token.
> - **Sessions:** full-text search across every transcript, resume in a terminal or the official extension's chat, and a warning if you're about to resume on the wrong git branch.
> - **Account profiles:** switch between saved Claude logins without `/logout` and `/login`. Honest caveat: profiles keep a local plaintext copy of each login's tokens in `~/.claude/manager-accounts/`, the same way Claude Code stores credentials on Linux and Windows.
> - **MCP:** every server from every config file, with on/off switches.
>
> It's Apache-2.0 and has no network client. It's not affiliated with Anthropic, and it works alongside the official extension rather than replacing it.
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager · Site: https://claudecodemanager.vishalg.in · Source: https://github.com/vishalguptax/claude-code-manager
>
> Happy to answer questions, and bug reports are very welcome.

### r/cursor

**Title:** Claude Code users on Cursor: a sidebar for your sessions, limits and MCP servers (Open VSX, free)

**Body:** use the same core as above, but open with: "Cursor installs extensions from Open VSX, and that's where most of this extension's [64,630] downloads come from." Link `/editors/cursor/`.

### Show HN — OWNER WRITES THIS

Facts for the owner's own text:
- **Title idea:** "Show HN: A VS Code sidebar for everything Claude Code keeps in ~/.claude". This avoids clashing with ldlework's "Show HN: Claude Code Manager".
- **Things HN readers will ask about:**
  - What exactly is read and written: see `facts.md` "Privacy".
  - That it has no network client: `grep` evidence.
  - Where tokens live for account profiles.
  - How the Quota card gets its numbers without the API: the statusline `rate_limits` documented at https://code.claude.com/docs/en/statusline.
- **Proof:** 4,600+ unit tests, Apache-2.0, and the source link.

### X / LinkedIn

> Claude Code keeps everything on your disk: transcripts, prompts, file backups, settings, logins.
>
> I made a free VS Code sidebar that turns `~/.claude` into 12 tabs. Search and resume any session, see your 5-hour and weekly limits in the status bar, switch accounts without /logout, and toggle MCP servers.
>
> No network client. No telemetry. Apache-2.0.
>
> 59-second tour → https://claudecodemanager.vishalg.in/#tour

Attach the tour video (`site/assets/video/claude-code-manager.mp4`) or `site/assets/og/home.png`.

### Product Hunt (if the owner launches)

- **Name:** Claude Code Manager
- **Tagline (60 chars max):** Everything Claude Code keeps, in one VS Code sidebar
- **Description:** Search and resume every Claude Code session, see token usage and your 5-hour and weekly limits, switch accounts, and manage MCP servers, skills, hooks, agents and plugins. Free, open source, no telemetry. Works in VS Code, Cursor, Kiro, VSCodium and other VS Code-based editors.
- **First comment:** say who made it, why, the local-only design, and that it complements Anthropic's extension.
- **Media:** the OG cards in `site/assets/og/` and the tour video.

---

## 4. Hooks grounded in what spreads

1. **Limits news (recurring):** "Your weekly limit, in the status bar, without an API call." Point to the usage-limits guide.
2. **Lost sessions:** "Claude Code deletes transcripts after 30 days by default (`cleanupPeriodDays`). Here's where they live." Point to the session-history guide. This is a useful post on its own, with the extension as a footnote.
3. **Multi-account:** "Two Claude accounts without /logout, and exactly where the tokens go."
4. **The `~/.claude` map:** "Every file Claude Code keeps, explained." The folder guide is a natural link.
