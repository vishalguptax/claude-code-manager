# 7 — Google Search Console setup

Baseline measurement. Without this we're guessing about rankings.

## Steps

1. https://search.google.com/search-console — sign in with your Google account
2. Add property → **URL prefix** → `https://claudemanager.vishalg.in/`
   (URL-prefix is easier than Domain property; Domain needs a DNS TXT record on vishalg.in — fine too if you have DNS access handy, and it covers future subdomains)
3. Verify: HTML file method — download the verification file, drop it in `site/`, commit, push (Pages deploys it), click Verify
   - Keep the file committed permanently; Google re-checks
4. Submit sitemap: Sitemaps → enter `sitemap.xml` → Submit
5. Request indexing for the homepage: URL inspection → paste homepage URL → Request indexing
6. Also add the **Bing Webmaster Tools** property while at it (https://www.bing.com/webmasters) — it imports from Search Console in one click, and Bing powers DuckDuckGo/Copilot answers

## What to watch (weekly, 5 min)

- Performance → Queries: which terms show impressions ("claude code manager", "claude code session manager")
- Pages → indexing status: homepage indexed? per-intent pages once added?
- Links report: backlinks landing from the Phase 4 work

## After setup

- [ ] Property verified: _____________
- [ ] Sitemap submitted: _____________
- [ ] Bing added: _____________
