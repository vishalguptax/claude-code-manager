# Growth work log

Dated lines: what was done, what was found, what was decided.

## 2026-10-11

- Set up: worktree `.claude/worktrees/growth-seo` on branch `growth/seo`, cut from `origin/main` @ 943eae0 (release v2.18.0). Upstream unset so nothing can push to main by accident. `feat/catalogs-quota-tour` in the main checkout is untouched.
- Decision: `.claude/worktrees/<slug>` follows the repo's `/ship` convention (gitignored via `.claude/*`).
- GSC read (Chrome /u/2/): 3 clicks / 547 impressions / avg pos 33 over 3 months; 93 queries. Commands cluster = 251 impr at pos ~49; usage cluster at pos 10-30. 9 indexed, 2 discovered-not-indexed. Raw: scratchpad gsc-2026-10-11.txt (to be copied into audit.md).
- Owner approved `npx lighthouse@13.4.1` (scratchpad only).
- Owner (mid-session): "Once everything is done, just push the new website." and "don't stop until end to end is completed." Decision: Gates 1–3 become checkpoints recorded here and in PLAN.md rather than stops. The site push to `main` is authorised. Still not authorised: publishing an extension release, repo-settings changes, posting anywhere.
- Finding: `.github/workflows/release.yml` publishes to both marketplaces on any push to `main` touching paths outside its `paths-ignore` (only site/**, README.md, marketing/**, .github/** and a few scripts are ignored). `scripts/build-site.mjs`, `docs/growth/**` and `package.json` are NOT ignored. Decision: (1) add the site's build inputs and docs/growth/** to paths-ignore in the same push; (2) keep manifest (package.json) listing changes off `main`, on branch `growth/listing`, for the owner's next release. Memory note confirms CI publishes on push.
- Verified (code): no network client in src/ (grep for fetch(/node:http(s)/XMLHttpRequest/WebSocket → none); branch-mismatch warning exists (src/features/sessions/commands.ts:387-420); export/import across machines (commands.ts:646-650); delete is a soft hide (commands.ts:189-193); account profiles copy OAuth tokens to plaintext files (src/features/account/profiles.ts:1-16). So the site's "never reads your OAuth token" is wrong; correct it.
- Lighthouse 13.4.1 mobile baseline (local server): perf 95/98/85/99/74/98/81/99/98 (home, sessions, usage, accounts, mcp, skills, commands, hooks, agents); a11y/BP/SEO 100 everywhere. CLS 0.265 usage, 1.116 mcp, 0.357 commands. Cause: app.js lockWidth() sets min-width on the inline <em data-scramble>, which has no effect on inline boxes, so scrambled glyphs re-wrap the h1 on mobile.
- Overflow matrix (CDP, requested-width comparison): 0 overflow across 9 pages × 320/375/1440/1920.
- validator.schema.org: home (WebSite, SoftwareApplication, VideoObject, FAQPage) 0 errors/0 warnings; subpage shape (SoftwareApplication+BreadcrumbList, FAQPage) 0/0.
- Finding: old domain https://claudemanager.vishalg.in/ 301 → http://claudecodemanager… (then a second hop to https); deep paths on the old domain return 404 (not redirected). GitHub homepage still points at the old domain.
- Ran `pnpm install --frozen-lockfile` in the worktree (CLAUDE.md setup step; installs only the existing lockfile, adds no dependency).
- Baseline checks on origin/main @943eae0 (before any edit): `pnpm run typecheck` exit 0; `pnpm test` 321 files / 4472 tests passed; `pnpm run build` ok; `pnpm run check` (biome) FAILS with 3 pre-existing formatting errors in src/webview. Not caused by this work. Fixing them touches src/, which would trigger a marketplace release on push, so the fix goes on the unpushed `growth/listing` branch.
- Owner (mid-session): build a NEW website with their `site-studio` skill (github.com/vishalguptax/agent-skills, skills/site-studio, commit 48cb155): "new design, modern, animated, motion graphics… I will not choose, do whatever is best". This overrides brief §2.4 ("keep the existing look"). The skill was cloned to the scratchpad and followed by hand, not installed into the owner's Claude config. Its gates run as recorded checkpoints because the owner said not to stop.
- Owner: "I am going to sleep… do everything on your own." Decision: proceed autonomously within what the owner has authorised: build, commit, and push the website to `main` without triggering a marketplace release. Repo description/topics/homepage (allowed by brief §2.5) are reversible, so do them. Still not done: publishing an extension release, GitHub social-preview upload (an account-settings form), and any posting or list submission.
- Verified: src/features/hooks/events.ts lists 33 hook events (the subagent said 28; corrected in facts.md/PLAN.md). BUILTIN_COMMANDS has 52 entries. CHANGELOG.md has 46 releases, newest 2.18.0 (2026-10-03).
- External facts spot-verified by re-fetching primary sources (Cursor, Devin, Kiro, VSCodium, Claude Code sessions/settings-reference/statusline/mcp/skills/checkpointing/authentication, support article 11145838). Antigravity registry unverified → no dedicated editor page; covered on /editors/ hub. Windsurf → Devin Desktop rename noted.
- Decision (deviation from brief §7.D "staleness test: committed HTML equals build output"): generated site files are NOT committed; they are built from site-src/ at deploy (Pages workflow) and gitignored. Reason: release.yml runs `pnpm test` on the release commit, which the release skill creates by prepending CHANGELOG.md (and CI then bumps package.json) with a shallow checkout. A committed-output staleness test would fail on every release (changelog page, baked version and git lastmod all drift), blocking the marketplace publish. Instead: the test asserts two offline builds are byte-identical (determinism) and checks every SEO invariant on the real build. Static assets (CSS, JS, fonts, screenshots, OG PNGs, icons) stay committed.
- Screenshots: added 560px WebP variants (generated with `sharp`, an existing devDependency, one-off) + srcset; home LCP image was a 1520px file shown at ~300px.
- Contrast (computed, WCAG relative luminance): every text token pair ≥ 4.5:1 in both themes; lowest is accent-ink on code-bg (light) 4.76:1. Panel text 15.1:1, panel dim 7.0:1, button text on clay 6.0:1.

### Titles and descriptions: before → after (chars)

| URL | Before title | After title | Desc before → after |
|---|---|---|---|
| / | Claude Code Manager — Sessions, Usage & MCP in VS Code (54) | Claude Code Manager — A VS Code Sidebar for Claude Code (55) | 147 → 150 |
| /sessions/ | Claude Code Session Manager for VS Code — Search & Resume (57) | Claude Code Session Manager — Search, Resume, Fork (50) | 167 → 148 |
| /usage/ | Claude Code Usage Tracker — Tokens, Quota & Cost by Model (57) | Claude Code Usage Tracker for VS Code — Tokens & Limits (55) | 172 → 150 |
| /accounts/ | Claude Account Switcher for VS Code — Skip the /logout Cycle (60) | Switch Claude Code Accounts Without /logout — VS Code (53) | 173 → 150 |
| /mcp/ | Claude Code MCP Manager — Toggle MCP Servers, No JSON (53) | Claude Code MCP Manager — Enable, Disable, Add Servers (54) | 162 → 143 |
| /skills/ | Claude Code Skills Manager for VS Code — Every Scope (52) | Claude Code Skills Manager for VS Code — Every Scope (52) | 156 → 148 |
| /commands/ | Claude Code Slash Commands Manager for VS Code (46) | Claude Code Slash Commands: Full List and Custom Commands (57) | 162 → 141 |
| /hooks/ | Claude Code Hooks Manager for VS Code — No JSON Editing (55) | Claude Code Hooks Manager — Every Event, No JSON Editing (56) | 158 → 148 |
| /agents/ | Claude Code Agents Manager for VS Code — Models & Scopes (56) | Claude Code Subagents Manager for VS Code (41) | 153 → 151 |

New pages (all new): /plugins/ (39/154), /checkpoints/ (54/133), /prompts/ (48/149), /memory/ (49/127), /config/ (52/134), /guides/ (52/152), /guides/claude-code-session-history/ (55/148), /guides/claude-code-usage-limits/ (54/151), /guides/claude-code-folder/ (54/148), /guides/disable-mcp-server-claude-code/ (43/151), /editors/ (54/141), /editors/cursor/ (50/137), /editors/windsurf/ (50/146), /editors/kiro/ (52/147), /editors/vscodium/ (43/153), /compare/ (46/154), /compare/claude-code-extension/ (57/153), /compare/ccusage/ (53/150), /compare/claude-swap/ (58/155), /compare/claude-code-gui/ (54/145), /changelog/ (45/95)
- Removed unreferenced site assets: assets/icon.svg (old nav mark), assets/og.png (one shared card, replaced by per-page cards in assets/og/), assets/marketplace-icon.png (icons in assets/icons/ were derived from media/marketplace-icon.png with sips).
- GitHub repo (gh repo edit, 2026-10-11): homepage claudemanager.vishalg.in → https://claudecodemanager.vishalg.in/; description aligned with the site; topics `claude-manager` → `vscode` (22k repos), `claude-session` → `claude-code-plugin` (9.3k repos); still 20/20. Verified with `gh api`. Social preview NOT set (account-settings form; owner step).
- Listing branch `growth/listing` (local only, commit 40a0d58, worktree .claude/worktrees/growth-listing): displayName, description, keywords (6 swapped, still 30), categories (Machine Learning → Other), galleryBanner, plus biome fixes for the 3 pre-existing lint errors. `pnpm run check` clean, 321 files / 4472 tests pass on that branch. Ships with the owner's next release.

### Verification (pre-push, local server, 2026-10-11)

Lighthouse 13.4.1 mobile, columns Perf A11y BP SEO, all 31 pages:
```
/                                          96 100 100 100 LCP 2.7 s CLS 0.008 
sessions/                                  99 100 100 100 LCP 2.1 s CLS 0 
usage/                                     99 100 100 100 LCP 2.1 s CLS 0 
accounts/                                  99 100 100 100 LCP 2.1 s CLS 0 
mcp/                                       99 100 100 100 LCP 2.1 s CLS 0.001 
skills/                                    99 100 100 100 LCP 2.1 s CLS 0 
commands/                                  99 100 100 100 LCP 2.1 s CLS 0.001 
hooks/                                     99 100 100 100 LCP 2.1 s CLS 0 
agents/                                    99 100 100 100 LCP 2.1 s CLS 0 
plugins/                                   99 100 100 100 LCP 1.9 s CLS 0 
checkpoints/                               99 100 100 100 LCP 1.9 s CLS 0.001 
prompts/                                   100 100 100 100 LCP 1.7 s CLS 0.001 
memory/                                    99 100 100 100 LCP 2.0 s CLS 0 
config/                                    99 100 100 100 LCP 2.1 s CLS 0 
guides/                                    100 100 100 100 LCP 1.7 s CLS 0 
guides/claude-code-session-history/        99 100 100 100 LCP 2.0 s CLS 0 
guides/claude-code-usage-limits/           99 100 100 100 LCP 1.9 s CLS 0 
guides/claude-code-folder/                 99 100 100 100 LCP 1.9 s CLS 0 
guides/disable-mcp-server-claude-code/     99 100 100 100 LCP 1.9 s CLS 0 
editors/                                   99 100 100 100 LCP 1.9 s CLS 0 
editors/cursor/                            99 100 100 100 LCP 2.0 s CLS 0 
editors/windsurf/                          99 100 100 100 LCP 1.9 s CLS 0 
editors/kiro/                              100 100 100 100 LCP 1.7 s CLS 0 
editors/vscodium/                          100 100 100 100 LCP 1.7 s CLS 0 
compare/                                   100 100 100 100 LCP 1.7 s CLS 0 
compare/claude-code-extension/             99 100 100 100 LCP 1.9 s CLS 0 
compare/ccusage/                           99 100 100 100 LCP 1.9 s CLS 0 
compare/claude-swap/                       99 100 100 100 LCP 1.9 s CLS 0 
compare/claude-code-gui/                   99 100 100 100 LCP 2.0 s CLS 0 
changelog/                                 99 100 100 100 LCP 1.9 s CLS 0 
404.html                                   100 100 100 100 LCP 1.7 s CLS 0 
```
Remaining audits under 0.9 are unminified-css, unused-css-rules and the cache/document-latency insights, which come from python http.server (no gzip, no cache headers). Home LCP 2.7s on the throttled mobile profile.
- Overflow matrix: 31 pages × 320/375/1440/1920 = 124 checks, 0 overflow (requested-width comparison).
- Build twice: second run changes nothing (36 generated files, shasum identical). xmllint sitemap OK. Workflows parse (Ruby YAML).
- site-studio check-site.mjs: 31 pages, 0 errors, 1 warning (404 without noindex: deliberate per brief §12).
- Tests: full suite 323 files / 4657 tests pass (185 new for the site generator). typecheck exit 0. Biome on the new scripts clean; repo-wide 'pnpm run check' still has the 3 pre-existing src errors on main (fixed on growth/listing).
- Interaction (headless CDP): theme toggle switches and persists across reload; copy/replay buttons appear with JS; first Tab focuses the skip link; no console errors on 9 pages checked; reduced-motion renders final state.
- All 122 changed paths are covered by release.yml paths-ignore (checked with Ruby against the workflow file) → this push cannot publish an extension version.
