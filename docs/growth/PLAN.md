# Growth plan: SEO, AI search, listings and a new site

Status: **approved by owner instruction, 2026-10-11.** The owner asked for a new site built with their `site-studio` skill: "new design, modern, animated, motion graphics… I will not choose, do whatever is best", and "don't stop until end to end is completed… push the new website". Gates 1–3 are therefore recorded here and in `LOG.md` as checkpoints, not stops. Requirement IDs: **M** = Must, **F** = Flexible.

Inputs: `facts.md` (every claim), `audit.md` (current state), `keywords.md` (intent map).

---

## 0. Design direction (site-studio Phases 2–3)

### Research (limited; stated plainly)
- **Sources seen:**
  - designprompts.dev **Swiss Minimalist** (`/swiss-minimalist`): a strict grid, heavy structural rules dividing columns, one signal colour, oversized grotesk. Borrow the grid and rules.
  - designprompts.dev **Industrial** (`/industrial`): hardware-panel bezels and a "SYSTEM OPERATIONAL" status pill. Borrow the status LEDs, which the product already has as live session dots. Avoid the neumorphic bevels.
- **Competitor sites looked at, and how we differ:**
  - code.claude.com docs: Mintlify docs look.
  - claudelog.com: a content site.
  - opcode/Claudia GitHub README: product screenshots.
  - growthjack: Marketplace page only.
  - None uses the product's own file system as the visual idea.
- **Not done:** Godly and Awwwards browsing (time). The direction rests on the two systems above and the skill's style notes.
- **Rejected:**
  - Liquid glass or 3D video heroes (motionsites.ai style). Heavy, and reads as generic AI.
  - Purple or indigo gradients (anti-generic checklist).
  - The current site's "rounded sheets on a burnt backdrop". The owner asked for something new.

### Concept
**"The index of `~/.claude`."** Claude Code keeps everything in a hidden folder: transcripts, prompts, file backups, settings, skills, agents, plugins, credentials. Claude Code Manager *indexes* that folder into a sidebar. The site is drawn as that index:
- a Swiss ruled ledger where every feature is an entry;
- each entry carries its source path as a mono "call number" (`projects/*.jsonl → Sessions`);
- the clay accent from the existing brand is the one signal colour.

### Directions
1. **Index, full strength (CHOSEN).**
   - **Type:** Inter variable 800 for display, tight. JetBrains Mono for paths and labels, with ligatures off. Instrument Serif italic only for one accent word per heading (brand continuity). All three are already self-hosted; no new downloads.
   - **Palette:** warm paper light (`#f6f3ee` bg, `#15130f` ink) and warm graphite dark (`#0f0e0d` bg, `#f3efe9` ink). One accent: clay `#d97757`, with a darker text variant for small text in light mode.
   - **Layout:** a 12-column grid with visible 1px rules, square corners on the ledger and 10px on screenshots. Real product screenshots throughout.
   - **Signature moment, "Indexing":** the hero shows a `~/.claude` listing (real paths from `src/core/config.ts`). Each line slides into its tab in a sidebar rail; the rail lights its status LED, and the real Sessions screenshot is revealed. It runs once on load, with a Replay button.
   - **Motion level:** high, but only in three moments: hero indexing, the quota bars filling in the Usage entry, and scroll-linked ruled-line draw-ins. Everything uses transform, opacity, clip-path and SVG stroke only.
   - **Why it suits the product:** the product literally turns files into a UI, so the hero demonstrates the product rather than describing it.
   - **Risks:** JS weight (budget ≤ 8 KB), CLS (every animated box has reserved size), and contrast of clay on paper (use the ink variant).
2. **Index, restrained.** The same ledger and call numbers, but the hero is static (the listing and sidebar shown side by side with connecting rules); scroll-driven rule draws only. *Not chosen:* the owner asked for motion graphics.
3. **Minimal editorial.** Swiss typography, one accent, almost no motion, the fastest of the three. *Not chosen:* the owner explicitly asked for animated, modern, motion.

### Motion spec

**Moment: Indexing (hero)**
- **Purpose:** show that CCM reads `~/.claude/` and turns it into tabs.
- **Trigger:** on load, after `document.fonts.ready`, plus 250 ms. "Replay" button.
- **Layer stack:** ruled grid · listing panel (mono lines) · sidebar rail (12 tab chips with LEDs) · screenshot frame.
- **Choreography:**
  1. 0–700 ms: listing lines appear top to bottom, each with opacity 0→1 and translateX(−8px→0), staggered 45 ms.
  2. 700–1700 ms: each line's tab chip in the rail activates (background clay-tint, LED on), staggered 70 ms, while a clay underline draws under the source line (scaleX 0→1).
  3. 1700–2200 ms: a clip-path wipe (inset 0 100% 0 0 → inset 0 0 0 0) reveals the screenshot.
- **Reduced motion:** the final state is rendered statically and the Replay button is hidden.
- **Without JS:** the final state (the HTML ships final).
- **Budget:** at most 4 KB of JS for this moment; Web Animations API; no library.

**Moment: Quota bars (Usage entry)**
- Bars labelled "5-hour window" and "7-day window", using an example value marked "example". They fill with scaleX when the entry enters the viewport (IntersectionObserver), once.
- **Reduced motion:** static.

**Moment: Rules draw in**
- CSS `animation-timeline: view()` on the ledger rules (scaleX), inside `@supports`; unsupported browsers see the rules static.
- **Reduced motion:** off.

---

## A. On-page SEO (M)

Titles are at most 60 characters and descriptions at most 155, unique, with the primary query early. They live in `site-src/pages.json` and are enforced by tests. One `h1` per page, phrased the way people search. Every feature page answers "what is it" in its first paragraph, ends with a visible FAQ (FAQPage only where it is visible), and links to its related pages.

| ID | Requirement |
|---|---|
| A1 M | Rewrite the title, description and h1 for all existing URLs (same URLs, to keep the indexed equity). The table of before and after lengths is printed by `node scripts/build-site.mjs --report` and pasted into `LOG.md` at build time. |
| A2 M | `/commands/` renders all 52 built-in commands from `src/features/commands/parser.ts`, and `/hooks/` renders the 33 hook events from `src/features/hooks/events.ts`. Both are read at build time, so the pages stay true to the shipped extension. |
| A3 M | Fix every false or overstated claim (`audit.md` F1, F13–F15) on the site, in `llms.txt` and in the README. |
| A4 M | Every page links to at least 3 related pages; the footer links every page. |

**No-Gos:** keyword stuffing; titles that make the product sound narrower than it is; any number not in `facts.md`.

## B. New pages (M unless noted)

Each page has its own intent (`keywords.md` §1), content unique to it, and real data. These are not templates with words swapped.

| Slug | Target query | Why it can win | H2 outline | Data source |
|---|---|---|---|---|
| /plugins/ | claude code plugins manager | No dedicated page ranks for the manager intent | What it shows · Disagreements it flags · Install from a marketplace · FAQ | `facts.md` Plugins |
| /checkpoints/ | claude code checkpoints restore | Explains `file-history` and gives a diff/restore UI | Where checkpoints live · Diff against disk · Restore safely · FAQ | `facts.md` Checkpoints |
| /prompts/ | claude code prompt history | Searches `history.jsonl` across projects | What gets saved · Search every prompt · Jump to the session · FAQ | `facts.md` Prompts |
| /memory/ | claude code memory viewer | Auto-memory per project plus link checks | What auto-memory is · Browse and prune · Broken links and orphans · FAQ | `facts.md` Memory |
| /config/ | claude code settings in vs code | A settings and permissions editor with snapshots | Settings by scope · Permissions allow/deny · Snapshots and restore · FAQ | `facts.md` Config |
| /guides/claude-code-session-history/ | where are claude code sessions stored | Exact paths plus recovery steps, from code and docs | Where sessions live · How long they're kept · Resume from the CLI · Find an old one · Move one to another machine | `config.ts`, docs (facts-ext) |
| /guides/claude-code-usage-limits/ | claude code usage limits | Only what Anthropic documents, with links, plus how to see your own numbers | The 5-hour window · Weekly limits · Check your usage (`/usage`, statusline) · When you hit a limit | Anthropic help center (facts-ext) |
| /guides/claude-code-folder/ | claude code config file location | A complete map of every file, from the source | Map of `~/.claude` · `~/.claude.json` · Project `.claude/` · Settings precedence | `src/core/config.ts:26-271`, docs |
| /guides/disable-mcp-server-claude-code/ | how to disable mcp server in claude code | Precise CLI and settings steps with doc links | With the CLI · In settings files · Per project vs global · From a sidebar | docs, `mcp/parser.ts` |
| /editors/ (hub) + /editors/cursor/, /windsurf/, /antigravity/, /kiro/, /vscodium/ | claude code in cursor (etc.) | Per-editor install source and what works, cited | Install · What works · Quirks · FAQ | facts-ext (registry per editor), `claudeCodeExtension.ts` |
| /compare/claude-code-extension/ | claude code extension vs claude code manager | An honest "use both" page from the official docs | What each does · Side-by-side table · How they work together | code.claude.com/docs/en/vs-code (read 2026-10-11) |
| /compare/ccusage/ | ccusage alternative | Fact table; says where ccusage is better | — | ccusage README, npm stats |
| /compare/claude-swap/ | claude-swap alternative | Fact table; says where claude-swap is better | — | claude-swap README |
| /compare/claude-code-gui/ | claude code gui alternatives | A roundup of GUIs, with facts only | — | the repos' READMEs and star counts (2026-10-11) |
| /changelog/ | claude code manager changelog | Rendered from `CHANGELOG.md` at build | — | `CHANGELOG.md` |
| /404.html | — | Not indexed (Pages serves it with HTTP 404) | — | — |

**No-Gos:**
- Editor pages for editors without a cited install path.
- Screenshots that aren't real. Where no editor-specific screenshot exists, the page says so and uses the real sidebar screenshot.
- Disparaging competitors.

## C. Structured data (M)

| ID | Requirement |
|---|---|
| C1 | Home: `WebSite` + `SoftwareApplication` (`softwareVersion` baked at build, `downloadUrl`, `installUrl`, `sameAs` Marketplace, Open VSX and GitHub, `license`, `offers` price 0) + `VideoObject` (uploadDate 2026-09-30, duration PT59S, thumbnail) + `FAQPage` (visible FAQ). Done in one `@graph`. |
| C2 | Feature pages: `WebPage` with `about` → the single `SoftwareApplication` `@id` (no more per-page "products"), plus `BreadcrumbList` and `FAQPage`. |
| C3 | Guides: `TechArticle` (headline, dateModified, author) + `BreadcrumbList` (+ `FAQPage` if visible). |
| C4 | Comparisons and editor pages: `WebPage` + `BreadcrumbList`. |
| C5 F | Changelog: `WebPage` + `BreadcrumbList`. |
| C6 | Every shape: 0 errors on validator.schema.org. |
| — | No `aggregateRating`: only 3 ratings exist, and the skill and Google's guidelines advise against it here. |

## D. Build pipeline (M; zero dependencies)

| ID | Requirement |
|---|---|
| D1 | `site-src/pages.json`: the content table (slug, title, description, h1, breadcrumb, type, related links, FAQ, OG card text). `site-src/pages/<slug>.html`: page bodies. |
| D2 | `scripts/build-site.mjs` (CLI) plus pure modules in `scripts/site/`. They render the head and JSON-LD, generate `sitemap.xml` (lastmod from git per page source), `llms.txt`, `robots.txt` and `site.webmanifest`, render the changelog, read the commands and hook events from `src/`, and bake the counts and version. |
| D3 | Counts are fetched live in CI. On any failure the build keeps the value in `site-src/stats.json` and prints `::warning`. The version baked is the newer of the published version and `package.json`. |
| D4 | OG images: 1200×630 PNG per page via headless Chrome `--screenshot` of a generated card. Each is written to a temp file, checked to be non-empty, then moved into place. If Chrome is missing, keep the existing image and print `::warning`. Fail the build if any page has no image. |
| D5 | Tests (Vitest, `scripts/site/__tests__/`): head rendering; title and description limits and uniqueness; JSON-LD parse; sitemap and robots; llms coverage; stats keep-last-on-failure; version pick; changelog render; **staleness** (an offline build equals the committed `site/`). |
| D6 | IndexNow: a key file in `site/`, and a deploy step on `push` events only that POSTs the sitemap URLs to api.indexnow.org and warns on a non-2xx response. |
| D7 | `pages.yml`: separate `build` (contents: read) and `deploy` (pages: write, id-token: write) jobs. Paths cover `site/**`, `site-src/**`, the build scripts, `CHANGELOG.md`, `package.json` and the two `src` data files. `fetch-depth: 0` for git lastmod. |
| D8 | `release.yml` `paths-ignore` adds `site-src/**`, `scripts/build-site.mjs`, `scripts/site/**`, `docs/growth/**`, `vitest.config.ts` and `biome.json` (none ship; all are in `.vscodeignore`), so a site push cannot publish the extension. |
| D9 | Performance budget: no runtime dependency; JS ≤ 8 KB gzipped per page; only the display font preloaded; images in WebP with width and height; no third-party requests. |

## E. Listings (ship with the next release; on branch `growth/listing`, not pushed)

| ID | Field | Before | After | Why |
|---|---|---|---|---|
| E1 F | `displayName` | Claude Code Manager — Sessions, Usage, MCP & Agents | Claude Code Manager — Sessions, History, Usage, MCP & Accounts | The store matches display-name tokens. "History" and "Accounts" are queries where CCM is absent from the top 50 or ranks 31. |
| E2 F | `description` | Manage Claude Code sessions, file checkpoints, prompts, MCP servers, … | Browse and resume Claude Code sessions, track usage and 5-hour/weekly quota, switch accounts, manage MCP servers, skills, hooks, agents and plugins. 100% local. | Leads with the strongest queries, in plain words |
| E3 F | `keywords` | drop: claude-manager, claude config, vscode extension, claude code cli, developer-tools, session manager | add: claude code usage, claude code history, claude code sessions, claude code plugins, quota, checkpoints | `keywords.md` §5 |
| E4 F | `categories` | AI, Machine Learning, Visualization | AI, Visualization, Other | It is not a machine-learning tool |
| E5 M | README top fold | — | Fix the OAuth, CSP and test-count claims; add a feature list that links to each site page; add the site link | Pushed now (README is release-ignored), so GitHub shows it immediately; the Marketplace shows it after the next release |
| E6 F | `galleryBanner` | `#1a1a2e` dark | `#0f0e0d` dark | Matches the new site |
| E7 M | Lint baseline | — | `biome check --write` on the 3 pre-existing files | Touches `src/`, so it must not be pushed with the site |

## F. GitHub (M)

| ID | Requirement |
|---|---|
| F1 | Homepage → https://claudecodemanager.vishalg.in/ |
| F2 | Description: "Claude Code Manager: a VS Code sidebar for Claude Code sessions, usage and quota, accounts, MCP, skills, hooks, agents and plugins. 100% local." |
| F3 | Topics (20): swap `claude-manager` → `vscode` and `claude-session` → `claude-code-plugin`. Keep the rest. |
| F4 | Owner: set the social preview to `site/assets/og/home.png` (Settings → General; an account form, so not done by the agent). |

## G. Off-site: see `launch-kit.md`. Drafts only; nothing posted or submitted.

## H. Measurement

**Weekly (Mondays):**
- **Search Console → Performance, last 28 days vs the previous period:**
  - Queries with impressions at position worse than 10 are candidates for a new section, or for a page if the intent differs.
  - Pages with more than 50 impressions and CTR under 1% are candidates for a title and description rewrite.
  - Watch first: `/commands/` (the 251-impression baseline, position 49), `/usage/` and the two new guides.
- **Pages report:** new URLs indexed (target: all ~30 within 4 weeks). Anything in "Discovered – not indexed" gets URL Inspection → Request indexing.
- **Installs:** the baked numbers are Marketplace installs and Open VSX downloads. Note both weekly in `docs/growth/LOG.md`; the Pages cron refreshes them every 12 hours.
- **GitHub:** stars, plus Insights → Traffic (referrers and popular content).

**After 4–6 weeks:** re-run the autocomplete and store-rank checks from `keywords.md`, and compare against this baseline.

## Done When (filled in at Verify; evidence in `LOG.md`)

| # | Criterion | Status |
|---|---|---|
| 1 | Unique title ≤ 60, description ≤ 155, canonical, OG, `summary_large_image`, 1200×630 image on every page | **True**: enforced by scripts/site/__tests__/site.test.ts (31 pages) |
| 2 | JSON-LD 0 errors; `softwareVersion` baked | **True**: validator.schema.org 0/0 on 4 live shapes; version baked by pickVersion() |
| 3 | Generated sitemap with lastmod; robots names AI crawlers and the sitemap; llms.txt covers every page; manifest and icons | **True**: live, tested, xmllint OK |
| 4 | Lighthouse mobile ≥ 95 ×4 on every page; CLS < 0.05 | **True** (local server): min Perf 96, others 100; max CLS 0.008 |
| 5 | No horizontal scroll at 320, 375, 1440 and 1920 | **True**: 124/124 checks |
| 6 | `keywords.md` maps each cluster to one URL | done (`keywords.md`) |
| 7 | Listing changes prepared, marked "next release" | **True**: local branch `growth/listing` @ 40a0d58 (not pushed) |
| 8 | GitHub description, topics and homepage updated | **True**, except the social preview (owner step) |
| 9 | Sitemap resubmitted; indexing requested; IndexNow returns 202 | **True**: 10 URLs requested; IndexNow 202 for 30 URLs |
| 10 | Repo checks pass; site build tested; the vsix excludes `site/` | **Partly**: tests 4657/4657, typecheck OK; `pnpm run check` fails on main from 3 pre-existing errors (fixed on growth/listing); `vsce ls` not run (tool not approved). The committed-HTML staleness test was replaced by a determinism test; see LOG |
| 11 | `launch-kit.md` with drafts; nothing posted | **True** |
| 12 | Measurement plan | §H |
