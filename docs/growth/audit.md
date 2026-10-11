# Audit: current state (2026-10-11)

Read-only. Live site https://claudecodemanager.vishalg.in, the repo at `origin/main` 943eae0, the published listings and Search Console. Raw evidence is in the session scratchpad (`crawl/`, `lh/`, `listings/`, `research/`) and is summarised here.

## 1. Live crawl (curl, raw HTML)

All 9 sitemap URLs return 200. `/nope/` returns 404 (correct). `site.webmanifest` returns 404 because there is no manifest. Live HTML equals `main` except for the baked counters: live shows 66,935 downloads and committed shows 28,855. The Pages workflow bakes the counts at deploy and never commits them back.

| URL | Title (chars) | Description (chars) | h1 | OG image w/h/alt | JSON-LD types | Words |
|---|---|---|---|---|---|---|
| / | Claude Code Manager — Sessions, Usage & MCP in VS Code (54) | 147 | 1 | yes | WebSite, SoftwareApplication (softwareVersion **2.10.9**), VideoObject, FAQPage | 937 |
| /sessions/ | …Session Manager for VS Code — Search & Resume (57) | **167** | 1 | **no** | SoftwareApplication, BreadcrumbList, FAQPage | 483 |
| /usage/ | Claude Code Usage Tracker — Tokens, Quota & Cost by Model (57) | **172** | 1 | **no** | same | 480 |
| /accounts/ | Claude Account Switcher for VS Code — Skip the /logout Cycle (60) | **173** | 1 | **no** | same | 522 |
| /mcp/ | Claude Code MCP Manager — Toggle MCP Servers, No JSON (53) | **162** | 1 | **no** | same | 435 |
| /skills/ | Claude Code Skills Manager for VS Code — Every Scope (52) | **156** | 1 | **no** | same | 384 |
| /commands/ | Claude Code Slash Commands Manager for VS Code (46) | **162** | 1 | **no** | same | 379 |
| /hooks/ | Claude Code Hooks Manager for VS Code — No JSON Editing (55) | **158** | 1 | **no** | same | 411 |
| /agents/ | Claude Code Agents Manager for VS Code — Models & Scopes (56) | 153 | 1 | **no** | same | 394 |

Other observations:
- Every page shares `assets/og.png` (hand-made, 215 KB). Subpages have no `og:image:width/height/alt` and no `twitter:image:alt`.
- `sitemap.xml` is hand-written; every `lastmod` is 2026-09-14.
- `robots.txt` names GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended and CCBot. It does not name Claude-SearchBot, Claude-User, Perplexity-User, Applebot-Extended or Bingbot.
- `llms.txt` covers the 9 pages but contains two false statements ("stores no credentials", "never touches your OAuth token").
- The old domain `https://claudemanager.vishalg.in/` returns 301 to **http**://claudecodemanager… (a second hop to https follows). Deep paths on the old domain return **404**.
- Three fonts are preloaded on the home page; the brief allows only the display font.

## 2. Structured data (validator.schema.org, via Chrome)

- `/`: WebSite, SoftwareApplication, VideoObject and FAQPage, all with **0 errors, 0 warnings**.
- `/sessions/` (the shape all subpages share): SoftwareApplication, BreadcrumbList and FAQPage, all with **0 errors, 0 warnings**.
- Content problems the validator can't catch:
  - `softwareVersion` is 2.10.9; the published version is 2.18.0.
  - The subpage `SoftwareApplication` entries are named "Claude Code Manager — Session Manager" and so on, so each subpage looks like a separate product.
  - FAQ answers repeat the OAuth claim that the code contradicts.

## 3. Lighthouse 13.4.1, mobile, local `python3 -m http.server` (no gzip)

| Page | Perf | A11y | BP | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| / | 95 | 100 | 100 | 100 | 3.0 s | 0 |
| /sessions/ | 98 | 100 | 100 | 100 | 2.3 s | 0 |
| /usage/ | **85** | 100 | 100 | 100 | 2.3 s | **0.265** |
| /accounts/ | 99 | 100 | 100 | 100 | 2.1 s | 0.022 |
| /mcp/ | **74** | 100 | 100 | 100 | 2.1 s | **1.116** |
| /skills/ | 98 | 100 | 100 | 100 | 2.3 s | 0 |
| /commands/ | **81** | 100 | 100 | 100 | 2.3 s | **0.357** |
| /hooks/ | 99 | 100 | 100 | 100 | 2.1 s | 0 |
| /agents/ | 98 | 100 | 100 | 100 | 2.3 s | 0 |

The CLS has one root cause. `site/app.js` `lockWidth()` sets `min-width` on the inline `<em data-scramble>`, and `min-width` does not apply to inline boxes. On a phone the scrambled glyphs re-wrap the `h1`, and the pages with the longest scrambled phrase shift the most.

## 4. Layout: horizontal overflow

Headless Chrome over CDP, comparing `innerWidth` and `scrollWidth` with the requested width (brief §12): **0 overflow** on all 9 pages at 320, 375, 1440 and 1920 px.

## 5. Search Console (URL-prefix property, last 3 months, Web)

- **Totals:** 3 clicks, 547 impressions, CTR 0.5%, average position 33. 93 queries. Raw list: scratchpad `gsc-2026-10-11.txt`.
- **Pages:** `/commands/` 251 impressions at position 49.4 · `/usage/` 1 click, 123 impressions, position 23.2 · `/sessions/` 2 clicks, 86 impressions, position 16.5 · `/` 50 impressions, position 7.7 · `/hooks/` 40 impressions, position 22.1 · `/accounts/` 32 impressions, position 11.1 · `/skills/`, `/agents/` and `/mcp/` 5–6 impressions each, positions 4.8–6.0.
- **Query clusters with impressions:**
  - **Commands:** about 45 query variants ("claude code commands" 41 impressions at position 47, "slash commands", "custom commands", "list"). This is the largest demand by far, and the page ranks on page 5. The page has no command list; a page that actually lists the commands would answer the query.
  - **Usage, tokens and quota:** about 30 variants ("claude code usage" 28 impressions at position 31.6, "token usage tracker" at 9.8, "quota tracker" at 10.0).
  - **Accounts:** "switching between claude accounts" at position 2, "claude cli switch account" at 11, "cswap claude" at 10.
  - **Sessions:** "how to fork claude code session" at 11, "claude code session manager github" at 17.
- **Indexing:** 9 indexed; 2 "Discovered – currently not indexed" (URLs not read).
- **Sitemaps:** `/sitemap.xml` was submitted 2026-07-04 and last read 2026-10-06 with status Success: 9 pages, 0 videos. The tour video is not in the sitemap and Google has indexed no video.
- **Enhancements:** a Breadcrumbs report exists. The FAQ report was not read.

## 6. VS Code Marketplace and Open VSX

- Both listings show v2.18.0, with the same display name and description as `package.json`. Open VSX shows all 30 keywords as tags plus `__sponsor_extension`. Both are verified or validated.
- Every README image (icon, demo.gif, 6 screenshots, video thumbnail, badges) returns 200 from raw.githubusercontent.com or shields, so the images load on the Marketplace.
- **Installs:** Marketplace 2,351, Open VSX 64,630. Open VSX, the registry the forks use, carries 96% of downloads.
- Store rank for the extension (research raw: `rankings_summary.txt`):

| Query | Marketplace | Open VSX |
|---|---|---|
| claude code manager | 2 (#1 is a 132-install extension with the exact name) | 2 |
| claude manager | 5 | 1 |
| claude | – | 3 |
| claude code | – (top 50) | 42 |
| claude code usage / claude usage | – / – | 8 / 12 |
| claude code sessions / claude session | – / – | 5 / 15 |
| claude hooks | 3 | 9 |
| claude agents | 8 | 8 |
| claude mcp | 5 | 2 |
| mcp manager | 21 | 5 |
| claude account | 31 | 21 |
| claude code history / ccusage | – / – | – / – |

Marketplace relevance follows display-name tokens, so a store search shows only what the name contains. "Usage" is in the name, yet the extension is absent from the Marketplace top 50 for "claude code usage" because the leaders put "Usage" first in their names and have 68k installs.

## 7. GitHub

- **Description:** "Claude Code Manager - sessions, MCP, skills, usage & accounts in your VS Code sidebar. 100% local." This matches the site, apart from the wording.
- **Homepage:** `https://claudemanager.vishalg.in/`, the **old domain** (301 → http → https).
- **Topics** (20/20): account-switcher, ai-coding, ai-tools, anthropic, antigravity, claude, claude-ai, claude-code, claude-code-manager, claude-manager, claude-session, claude-session-manager, cursor, developer-tools, mcp, model-context-protocol, session-manager, usage-tracker, vscode-extension, windsurf.
  - Weak: `claude-manager` (the old name), `claude-session` (few repos).
  - Missing despite sizeable counts: `vscode` (22k repos), `claude-code-plugin` (9.3k), `claude-skills` (10.6k), `claude-code-hooks` (605), `open-vsx` (135).
- Stars 32, forks 7, Discussions enabled. Releases are tagged per version (latest 2.18.0, 2026-10-03).
- **Social preview:** could not be read without Settings access. The owner should set it.

## 8. Competitors (public data, 2026-10-11; detail in `keywords.md` and `launch-kit.md`)

| Tool | Form | Public size | Overlap | What it's clearly better at |
|---|---|---|---|---|
| Claude Code for VS Code (anthropic.claude-code) | Official extension | 27.5M Marketplace / 57.1M Open VSX | Chat UI. Sessions via its own history. | It *is* Claude Code in the editor. Complementary: CCM resumes into it. |
| growthjack.claude-code-usage | VS Code extension | 68k / 48.6k | Usage | Single-purpose usage view; leads the store for "claude code usage" |
| es6kr.claude-sessions | VS Code extension | 10k / 84.7k | Sessions | Leads "claude code sessions" |
| agsoft.claude-history-viewer | VS Code extension | 11k / 130k | Session history, usage | History viewer covering Claude Code, Codex and others |
| ccusage (ryoppippi) | CLI (npm) | see `launch-kit.md` | Usage reports | Detailed CLI reports, scripting, multiple agents |
| claude-swap (realiti4) | CLI (PyPI) | see `launch-kit.md` | Account switching | CLI-first, editor-independent; ranks #1 on Google for "claude code switch account" |
| opcode / Claudia, Claude Code UI and other GUIs | Desktop or web apps | see `launch-kit.md` | GUI for sessions | A standalone app, no editor needed |

## Findings

| # | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| F1 | High | The site states "never reads your OAuth token" and "stores no credentials", but account profiles copy tokens to plaintext files | `profiles.ts:1-44,757-765`; `site/index.html` FAQ and privacy cards; `llms.txt` | Correct the copy everywhere (site, llms.txt, README) with the "safe wording" in `facts.md` |
| F2 | High | `softwareVersion` is hand-written and stale (2.10.9 against 2.18.0) | §2 | Bake it at build from the newer of the published and repo versions |
| F3 | High | The biggest demand cluster (Claude Code commands, 251 impressions) lands on a page with no command list, at position 49 | §5 | Render the 52 built-in commands with descriptions from `src/features/commands/parser.ts` |
| F4 | High | 7 of 9 meta descriptions exceed 155 chars | §1 | Rewrite all of them, enforced by a test |
| F5 | High | CLS 0.27–1.12 on 3 pages; Performance 74–85 | §3 | Fix the scramble lock (lock the block's height, or drop the effect in the redesign) |
| F6 | Medium | Coverage gaps: plugins, checkpoints, prompts, memory and config have no page; no guides, editor pages, comparisons or changelog | §1, keywords | New pages (PLAN B) |
| F7 | Medium | Subpages lack OG image size and alt; all pages share one hand-made OG image | §1 | Generate a 1200×630 image per page at build |
| F8 | Medium | Sitemap and `lastmod` are hand-written; no web manifest; no IndexNow | §1 | Generate them; add IndexNow to the deploy |
| F9 | Medium | GitHub homepage points at the old domain | §7 | Set it to https://claudecodemanager.vishalg.in |
| F10 | Medium | The old domain redirects to http and drops paths (deep links 404) | §1 | Owner: fix the redirect at the DNS or redirect host. Not in this repo. |
| F11 | Medium | Pages workflow paths miss build inputs; one job holds `pages: write` for the build | `.github/workflows/pages.yml` | Split into build and deploy jobs; widen paths |
| F12 | Medium | `release.yml` publishes on pushes touching `scripts/**` (except two files), `docs/growth/**`, `vitest.config.ts` and `biome.json`, none of which ship | `release.yml:3-27`; `.vscodeignore` | Add the site build inputs to `paths-ignore` |
| F13 | Low | "Join 28,855 developers" and "Put your tool in front of N developers" count downloads as people | `site/index.html` CTA and sponsor slot | Say "downloads" |
| F14 | Low | "5.0★ rating" without the count (3 ratings) | `site/index.html` hero | Show the count, or drop the rating |
| F15 | Low | README says "3,600+ unit tests" and "CSP that blocks every outbound request" | `README.md:218,281` | 4,400+ tests; correct the CSP wording |
| F16 | Low | `pnpm run check` fails on `main` (3 formatting errors in src/webview) | baseline in `LOG.md` | Fix on the unpushed `growth/listing` branch (touches src/) |
| F17 | Info | The tour video isn't discoverable (0 videos in the sitemap) | §5 | Add a video sitemap entry and keep VideoObject valid |
| F18 | Info | `SEO-AUDIT.md` claims Google "retired FAQ rich results for all sites on 2026-05-07". I could not verify it. | `SEO-AUDIT.md` L1 | Don't rely on it. Keep FAQPage only where the FAQ is visible. |
