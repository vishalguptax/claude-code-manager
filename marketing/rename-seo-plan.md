# Rename & SEO Plan: "Claude Manager" → "Claude Code Manager"

**Date:** 2026-07-03
**Status:** Proposed
**Research basis:** 3-track research (competitors, SERP/indexing audit, trademark policy), 2026-07-03.

## Decision

Rename display brand to **"Claude Code Manager"**. Keep extension ID `vishalguptax.claude-manager` forever.

| Axis | Finding |
|---|---|
| Search intent | Head term is "claude code"; nobody searches "claude manager". Anthropic's "Claude Managed Agents" (Apr 2026) saturates the old term — unwinnable |
| Marketplace | Relevance = display-name token match. Currently absent from top 100 for "claude code"; a 56-install dead extension holds #1 for "claude code manager" on exact-name match alone |
| Trademark | Rename *reduces* risk. "Claude" + generic noun reads official (enforcement pattern: Clawdbot, Claudia). Descriptive "claude-code-*" cohort (router 35K★, templates 28K★) unenforced |
| Mechanics | `displayName`-only change keeps ID, installs, reviews, ratings (microsoft/vscode#92996) |
| Collisions | PrudkoArtur marketplace ext (56 installs, dead since 2026-04) — display names may duplicate. npm `claude-code-manager` — archived. **Never brand as "CCM"/"CCManager"** — owned by kbwo's TUI (1.2K★, active) |

## Invariants — never change

- `"name": "claude-manager"` and `"publisher": "vishalguptax"` in package.json (extension ID; changing loses 1.5K installs + reviews, old name permanently reserved)
- `claudeManager.*` settings namespace (breaks user configs)
- Command IDs (`claudeManager.open`, …), view container IDs (breaks keybindings/muscle memory)
- Repo slug `vishalguptax/claude-manager` and site domain `claudemanager.vishalg.in` (existing links = only backlink equity we have; renaming repo adds redirect risk for raw.githubusercontent icon URLs in README)
- Source-internal strings (log prefixes, test names) — cosmetic, zero SEO value, churn risk

## Phase 1 — Rename (repo, one PR)

User-facing brand strings only:

1. **package.json**
   - `displayName`: `Claude Code Manager: Sessions, MCP, Skills, Usage & Accounts`
     (front-load "Claude Code Manager" — marketplace card truncates ~30 chars)
   - `description`: keep (already keyword-rich, starts "Manage Claude Code sessions…")
   - `keywords`: add `claude-code-manager`, `claude code manager`, `session-manager` (marketplace caps ~30; trim low-value ones if over)
   - `contributes.viewsContainers` sidebar **title**: `Claude Code Manager` (display label only, not ID)
2. **README.md** (18 hits)
   - H1 + all prose: "Claude Code Manager"
   - Add footer disclaimer (opcode pattern): *"Claude and Claude Code are trademarks of Anthropic, PBC. Claude Code Manager is an independent open-source project, not affiliated with or endorsed by Anthropic."*
3. **Marketplace listing extras** — publisher description field on publish; same disclaimer at bottom
4. **Webview UI**: `src/features/sessions/webview/ui/components/Footer.tsx`, sidebar header in `scripts/generate-screenshots.mjs` mocks ("CLAUDE MANAGER" caption) — regenerate screenshots later (Phase 5, batched)
5. **extension.ts** status bar text `$(sparkle) Claude Manager` → `$(sparkle) Claude Code Manager` (check width; `$(sparkle) CC Manager` too close to CCManager — avoid)
6. **Do not touch**: docs/releases/* (historical), scripts/v2-orchestration/* (archive), .binaryos/*

Tests: update any test asserting displayName/title strings (`test/integration/suite/extension.test.ts`, diagnostics tests). `npm test` green before merge.

## Phase 2 — Site on-page overhaul (same day)

`site/index.html` (+ `llms.txt`, `app.js` title refs, `style.css` content strings):

1. `<title>`: `Claude Code Manager — Sessions, MCP, Skills & Usage in VS Code`
2. **H1 fix (top on-page issue):** six H1s of pure marketing copy → exactly **one H1**: `Claude Code Manager for VS Code` (or hero headline retaining "Mission control for Claude Code" as styled `<p>`, H1 carries keywords). Section headings become keyworded H2s: "Claude Code session manager", "Claude Code usage tracking", "MCP server manager", "Claude account switcher"
3. JSON-LD `SoftwareApplication.name`: `Claude Code Manager`; bump `softwareVersion` (currently stale at 2.2.0); add `alternateName: "Claude Manager"`
4. og:title / twitter:title / og:site_name → new name; regenerate og.png (Edge headless recipe in memory)
5. Add disclaimer line in footer (trademark)
6. `site/llms.txt` — update name + keywords
7. Keep canonical/domain as-is

## Phase 3 — Release & republish

1. `npm run release:minor` → v2.3.0 ("rename" warrants minor)
2. Release notes: explain rename ("same extension, clearer name"), reassure settings/IDs unchanged
3. Publish Marketplace + `npm run publish:openvsx`
4. Verify: marketplace search "claude code manager" within ~48h — expect #1 (out-competes 56-install squatter); "claude code" — expect top-100 entry
5. GitHub repo: update About description + topics (`claude-code`, `claude-code-manager`, `vscode-extension`, `mcp`, `session-manager`); keep repo slug

## Phase 4 — Off-site distribution (the actual Google bottleneck)

Zero backlinks = cause #1 of not ranking. Order by authority/effort:

| # | Action | Target | Notes |
|---|---|---|---|
| 1 | PR to `hesreallyhim/awesome-claude-code` (48K★) | High-authority backlink | Follow list's contribution format |
| 2 | Post r/ClaudeAI | Traffic + crawl signals | Show-off post w/ screenshots; disclose author; link site not marketplace |
| 3 | dev.to writeup | Indexed article | "Managing Claude Code sessions in VS Code" — tutorial angle, not ad |
| 4 | Ask Nimbalyst to add to "Best Claude Code Session Manager 2026" comparison | Steal listicle slot | They already compare 5 tools; email/issue |
| 5 | Submit to directories (claudemarketplaces.com, aitmpl ecosystem lists, VoltAgent awesome lists) | Long-tail links | Competitors listed there, we're not |
| 6 | Anthropic Software Directory application | Legitimacy + link | Note: grants no trademark rights; disclaimer stays |
| 7 | HN Show HN (optional, after v2.3.0 stable) | Spike + links | One shot — time it with a flagship feature |

## Phase 5 — Content expansion (weeks 2–4)

One URL today = one keyword footprint. Add per-intent pages (each its own SERP):

1. `/sessions` — "Claude Code session manager" (proven intent: comparison articles exist)
2. `/usage` — "Claude Code usage tracker" (8+ competing extensions = demand)
3. `/accounts` — "Claude Code account switcher" (**near-zero competition, most differentiated feature — likely fastest win**)
4. `/mcp` — "Claude Code MCP manager"
5. Each: keyworded H1, screenshots, FAQ JSON-LD, cross-links, added to sitemap
6. Regenerate screenshots w/ new sidebar branding (batch w/ Phase 1 item 4)

## Phase 6 — Measure

1. Google Search Console: verify property, submit sitemap, watch queries/impressions
2. Weekly checks: marketplace rank for "claude code manager" / "claude code"; Google top-20 for "claude code session manager"
3. 30-day targets: marketplace #1 "claude code manager"; site in Google top-20 "claude code session manager"; ≥3 external backlinks live
4. 90-day: site top-10 for one per-intent keyword; installs trend (baseline 1.5K)

## Risks

| Risk | Mitigation |
|---|---|
| Anthropic objects to any "Claude" use | Descriptive name + disclaimer + no Anthropic logo styling; precedent cohort massive; rename is strict risk reduction vs status quo |
| User confusion at rename | Release notes + "formerly Claude Manager" in README first 90 days; `alternateName` in JSON-LD |
| npm CLI `claude-code-manager` confusion | Different platform, archived; no action |
| Brand dilution vs kbwo's CCManager | Never abbreviate to CCM/CCManager anywhere |
