# SEO Audit — claudecodemanager.vishalg.in

**Date:** 2026-07-07
**Scope:** Full site (5 URLs)
**Method:** Verified against raw HTML source (`curl`), not rendered summaries. Hosting: GitHub Pages (static).
**Business type:** SaaS / developer tool (marketing site for the *Claude Code Manager* VS Code extension).

---

## 1. Executive Summary

The site is **well-optimized**. Fundamentals that most sites get wrong are already correct here: unique metadata per page, self-referencing canonicals, valid sitemap + robots, rich structured data on the homepage, an `llms.txt` for AI crawlers, a clean internal-link graph, and fast static delivery.

**SEO Health Score: 88 / 100.**

The remaining upside is **not** fixing broken things — it is **expanding coverage**. The product advertises "eight surfaces," but only four have dedicated landing pages. Building the missing four pages and upgrading subpage schema is the single biggest lever available.

There are **no Critical (indexing-blocking) issues.**

> **Update 2026-07-08 — top levers shipped.** The four missing pages (`/skills/`, `/commands/`, `/hooks/`, `/agents/`) are built, `SoftwareApplication` + `BreadcrumbList` schema is now on every subpage (H1), `twitter:description` is on all pages (M2), the sitemap carries all 9 URLs, and internal cross-linking is complete. All JSON-LD validated. Findings H1, H2, and M2 are resolved below. Remaining: resubmit the sitemap in GSC after deploy, then re-audit to confirm score movement.

### Score breakdown

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 92 | 20.24 |
| Content Quality | 23% | 85 | 19.55 |
| On-Page SEO | 20% | 92 | 18.40 |
| Schema / Structured Data | 10% | 80 | 8.00 |
| Performance (CWV) | 10% | 90 | 9.00 |
| AI Search Readiness (GEO) | 10% | 88 | 8.80 |
| Images | 5% | 90 | 4.50 |
| **Total** | **100%** | | **~88** |

> Performance and CWV scores are based on delivery fundamentals (static HTML, small payloads, preloaded fonts, WebP images, gzip). No CrUX field data was pulled — a low-traffic site typically has none yet. Run `/seo google` with a PageSpeed/CrUX key for lab + field numbers.

---

## 2. What Is Already Correct (Do Not Touch)

Verified present across pages:

- **Per-page `<title>`** — unique, keyword-led, all under ~70 chars, each front-loaded with the `Claude Code` brand.
- **Per-page meta description** — unique, benefit-driven, within length.
- **`<meta name="robots" content="index, follow, max-image-preview:large">`** on every page.
- **Self-referencing `<link rel="canonical">`** correct on every page.
- **`<html lang="en">`** present.
- **Single `<h1>` per page** — no multiple-H1 or missing-H1 issues.
- **Open Graph** — full set on homepage (`og:type/site_name/url/title/description/image` + image width/height/type/alt).
- **Twitter Card** — `summary_large_image` on every page.
- **`og.png`** — valid PNG, 1200×630, returns HTTP 200, 227 KB.
- **Structured data** — homepage carries `SoftwareApplication` + `Offer` + `Person` + `FAQPage`; each subpage carries `FAQPage`.
- **Sitemap** — valid XML (not index), 5 URLs, `lastmod 2026-07-04`, referenced from robots.txt.
- **robots.txt** — permissive (`Allow: /`), declares sitemap.
- **`llms.txt`** — present (HTTP 200) for AI-crawler guidance.
- **Internal linking** — homepage links all four subpages; subpages cross-link each other (good hub-and-spoke).
- **Images** — all carry `alt`; the single empty-`alt` per page is a decorative asset (correct usage).
- **Delivery** — HTTPS, gzip enabled, real 404 for unknown URLs, font preloads (`inter-latin.woff2`, `instrument-serif-italic-latin.woff2`), WebP screenshots.

---

## 3. Per-Page Inventory

| URL | Title | H1s | Meta desc | Canonical | Schema types |
|---|---|---|---|---|---|
| `/` | Claude Code Manager — Sessions, Usage, MCP & Agents in VS Code | 1 | ✅ | ✅ self | `SoftwareApplication`, `Offer`, `Person`, `FAQPage` |
| `/sessions/` | Claude Code Session Manager for VS Code — Search, Resume, Fork | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/usage/` | Claude Code Usage Tracker — Tokens, Quota & Cost by Model | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/accounts/` | Claude Account Switcher — Swap Claude Code Logins Without /logout | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/mcp/` | Claude Code MCP Manager — Toggle MCP Servers Without Editing JSON | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/skills/` | Claude Code Skills Manager for VS Code — Global, Project, Plugin | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/commands/` | Claude Code Slash Commands Manager for VS Code — Browse & Run | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/hooks/` | Claude Code Hooks Manager for VS Code — Every Scope, No JSON | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |
| `/agents/` | Claude Code Agents Manager for VS Code — Models & Scopes | 1 | ✅ | ✅ self | `SoftwareApplication`, `BreadcrumbList`, `FAQPage` |

**Coverage:** all 8 advertised surfaces now have a dedicated landing page (Config is an in-extension panel, not marketed as a standalone surface — no page needed). Skills, Commands, Hooks, and Agents pages were added 2026-07-08, each with `SoftwareApplication` + `BreadcrumbList` + `FAQPage` schema and full internal cross-linking.

---

## 4. Findings by Priority

### Critical — blocks indexing / triggers penalty
**None.** The site indexes cleanly.

---

### High — significant ranking impact (fix within 1 week)

#### H1. Subpages lack product/breadcrumb schema — ✅ RESOLVED 2026-07-08
**Observation:** `/sessions/`, `/usage/`, `/accounts/`, `/mcp/` carry only `FAQPage`. They have no `SoftwareApplication`, `WebPage`, or `BreadcrumbList`.
**Why it matters:** Google reads these as FAQ blobs, not product feature pages. Breadcrumb markup also drives the breadcrumb SERP display and clarifies site hierarchy.
**Fix:** Add `SoftwareApplication` (or `WebPage` + `BreadcrumbList`) to each subpage. See §6 for ready JSON-LD.
**How we'll know it worked (leading indicator):** GSC → Enhancements → Breadcrumbs / "Software App" shows valid items on these URLs within a crawl cycle.
**Falsifiability:** If GSC never reports these enhancements after re-crawl, the markup is malformed — validate at [validator.schema.org](https://validator.schema.org).

#### H2. Coverage gap — 4 of 8 advertised surfaces have no landing page — ✅ RESOLVED 2026-07-08
**Observation:** The product markets eight surfaces; only four are indexable pages. **Skills, Hooks, Commands, Agents** have real search demand (e.g. "Claude Code skills manager", "Claude Code hooks GUI", "Claude Code agents manager") and currently rank for nothing because no page exists.
**Why it matters:** Each missing page is an un-targeted keyword cluster. This is the highest-ROI action — it grows the indexable surface, not just tunes it.
**Fix:** Build four new pages mirroring the existing subpage template (unique title/desc/H1, ~400–600 words, screenshot, FAQ, cross-links). Add to sitemap.
**Leading indicator:** New impressions appear in GSC for the target queries within 2–4 weeks of indexing.
**Falsifiability:** If, after 4 weeks indexed, the pages draw zero impressions, the keyword targeting missed — revisit intent with `/seo cluster "Claude Code skills"`.

---

### Medium — optimization opportunity (fix within 1 month)

#### M1. No security headers
**Observation:** Response carries no `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, or `Referrer-Policy`.
**Constraint:** GitHub Pages **cannot** set custom response headers. This is a hosting limitation, not a config miss.
**Fix (only if worthwhile):** Front the site with Cloudflare (free tier) and set headers there. Batch this with M4 (see below) since one move solves several items. Low direct SEO weight — do it for security/trust, not rankings.

#### M2. `twitter:description` missing on subpages — ✅ RESOLVED 2026-07-08
**Observation:** Homepage has `twitter:description`; the four subpages do not (they have card + title + image only).
**Fix:** Add one `<meta name="twitter:description" content="...">` line per subpage (reuse the existing `og:description` value). Trivial consistency fix for share previews.

#### M3. Low cache TTL
**Observation:** `cache-control: max-age=600` (10 minutes).
**Constraint:** GitHub Pages default; not tunable on GH Pages.
**Fix:** Only addressable via Cloudflare (same move as M1). Informational otherwise.

#### M4. Consolidation move (optional)
Fronting with Cloudflare simultaneously resolves M1 (security headers), M3 (cache TTL), and adds Brotli (see L2). If you're going to touch DNS at all, do all three at once. If not, skip — none are ranking-critical.

---

### Low / Informational

#### L1. FAQPage schema no longer earns SERP rich results
**Observation:** All five pages use `FAQPage`.
**Context:** Google **retired FAQ rich results for all sites on 2026-05-07.** There is no FAQ SERP feature anymore.
**Action:** **Keep the markup.** It still helps AI/LLM citation (ChatGPT, Perplexity, Google AI Overviews parse it). Do **not** remove it, and do **not** add new `FAQPage` expecting SERP stars. For genuine user-submitted Q&A, prefer `QAPage`.

#### L2. gzip only, no Brotli
GitHub Pages serves gzip, not Brotli. Marginal. Resolved by Cloudflare-front (M4) if desired. Otherwise ignore.

#### L3. `keywords` meta tag present on homepage
Google ignores it. Harmless. Leave or remove — no impact.

---

## 5. Action Plan (Sequenced)

Ordered by ROI and dependency:

- [x] **1. Build 4 new feature pages** — Skills, Commands, Hooks, Agents. Cloned the subpage template; unique title/desc/H1, screenshot, 4 FAQ items, cross-links to siblings. *(Resolved H2 — biggest lever. Shipped 2026-07-08.)*
- [x] **2. Add `SoftwareApplication` + `BreadcrumbList` JSON-LD** to all subpages, including the 4 new ones. *(Resolved H1. All 8 subpages now carry the graph; JSON-LD validated.)*
- [x] **3. Add subpages to `sitemap.xml`** — 4 new URLs added, `lastmod 2026-07-08`. **Still to do: resubmit sitemap in GSC** after deploy.
- [x] **4. Add `twitter:description`** to every subpage. *(Resolved M2. All 4 original subpages + 4 new ones.)*
- [ ] **5. (Optional) Cloudflare front** — security headers + longer cache TTL + Brotli in one move. *(Resolves M1, M3, L2)*
- [x] **6. Leave FAQ schema as-is.** Kept on all pages. *(L1)*

**Remaining manual step:** after these deploy, resubmit `sitemap.xml` in Google Search Console and request indexing for the 4 new URLs so they enter the crawl queue faster. Then re-run `/seo audit` to confirm score movement. Step 5 (Cloudflare) is independent and optional.

---

## 6. Ready-to-Paste Structured Data (for step 2)

Add one `<script type="application/ld+json">` block per subpage inside `<head>`, alongside the existing `FAQPage`. Example for `/sessions/`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Claude Code Manager — Session Manager",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "VS Code, Cursor, Windsurf, VSCodium",
      "url": "https://claudecodemanager.vishalg.in/sessions/",
      "description": "Full-text search across every Claude Code session, git-branch-aware resume, forking, and import/export. Free, 100% local.",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "author": { "@type": "Person", "name": "Vishal Gupta" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Claude Code Manager", "item": "https://claudecodemanager.vishalg.in/" },
        { "@type": "ListItem", "position": 2, "name": "Session Manager", "item": "https://claudecodemanager.vishalg.in/sessions/" }
      ]
    }
  ]
}
</script>
```

Swap `name`, `url`, `description`, and the breadcrumb leaf for each page (`/usage/`, `/accounts/`, `/mcp/`, and the 4 new pages). Validate every page at <https://validator.schema.org> before shipping.

**`twitter:description` line to add per subpage (step 4):**

```html
<meta name="twitter:description" content="REUSE THE PAGE'S og:description VALUE HERE">
```

---

## 7. Verification Log (raw evidence)

| Check | Result |
|---|---|
| robots.txt | `Allow: /`, sitemap declared ✅ |
| sitemap.xml | valid XML, 5 URLs, `lastmod 2026-07-04` ✅ |
| Homepage `<head>` | title, description, keywords, robots, canonical, full OG + Twitter, theme-color, `lang="en"`, font preloads ✅ |
| JSON-LD blocks | home: 2 (SoftwareApplication+Offer+Person, FAQPage); each subpage: 1 (FAQPage) |
| H1 count | exactly 1 per page ✅ |
| Image alt | 0 missing-alt across all pages; 1 decorative empty-alt each ✅ |
| Response headers | `server: GitHub.com`, `content-type text/html`, `cache-control max-age=600`; **no** HSTS/CSP/X-Content-Type/Referrer-Policy |
| 404 | unknown URL → HTTP 404 ✅ |
| Compression | `content-encoding: gzip` (no Brotli) |
| llms.txt | HTTP 200 ✅ |
| og.png | HTTP 200, image/png, 1200×630, 227 KB ✅ |
| Internal links | homepage → all 4 subpages; subpages cross-link ✅ |

---

*Report generated via `/seo audit`. Re-run after shipping steps 1–4 to confirm score movement, or run `/seo drift baseline https://claudecodemanager.vishalg.in` now to track regressions on future deploys.*
