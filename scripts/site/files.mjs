// Crawl and app files generated from the page table: sitemap.xml, robots.txt,
// llms.txt and site.webmanifest. Pure string rendering.

import { esc, formatInt } from "./html.mjs";
import { LINKS, pageUrl } from "./seo.mjs";

export const indexable = (pages) => pages.filter((p) => p.type !== "notfound");

export function sitemap(ctx) {
  const urls = indexable(ctx.pages)
    .map((p) => {
      const video =
        p.type === "home" && ctx.site.video
          ? `
    <video:video>
      <video:thumbnail_loc>${ctx.origin}${ctx.site.video.poster}</video:thumbnail_loc>
      <video:title>${esc(ctx.site.video.name)}</video:title>
      <video:description>${esc(ctx.site.video.description)}</video:description>
      <video:content_loc>${ctx.origin}${ctx.site.video.mp4}</video:content_loc>
      <video:duration>${ctx.site.video.seconds}</video:duration>
      <video:publication_date>${ctx.site.video.uploadDate}</video:publication_date>
    </video:video>`
          : "";
      return `  <url>
    <loc>${pageUrl(ctx, p.slug)}</loc>
    <lastmod>${ctx.lastmod(p)}</lastmod>${video}
  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls}
</urlset>
`;
}

// Named so the intent is explicit: this is a public, open-source project's
// site and it wants to be read and cited by search and answer engines. The
// wildcard already allows them; naming them documents the decision.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bingbot",
];

export function robots(ctx) {
  const named = AI_CRAWLERS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join("\n");
  return `# Claude Code Manager: everything here is public and meant to be cited.
# The wildcard allows every crawler; the named blocks state that intent for
# search and AI answer engines explicitly.

${named}
User-agent: *
Allow: /

Sitemap: ${ctx.origin}/sitemap.xml
`;
}

export function llms(ctx) {
  const s = ctx.stats;
  const section = (group, heading) => {
    const lines = ctx.pages
      .filter((p) => p.group === group && p.type !== "hub")
      .map((p) => `- [${p.crumb}](${pageUrl(ctx, p.slug)}): ${p.llms ?? p.description}`)
      .join("\n");
    return `## ${heading}\n\n${lines}\n`;
  };
  return `# Claude Code Manager

> ${ctx.site.appDescription}

${ctx.site.llmsIntro}

Facts: free, Apache-2.0, version ${ctx.version}. ${formatInt(s.marketplaceInstalls)} VS Code Marketplace installs and ${formatInt(s.openVsxDownloads)} Open VSX downloads at build time. Install ID \`vishalguptax.claude-manager\`. Independent project, not affiliated with Anthropic.

${section("features", "Features")}
${section("guides", "Guides")}
${section("editors", "Editors")}
${section("compare", "Comparisons")}
## Links

- [Install from the VS Code Marketplace](${LINKS.MARKETPLACE})
- [Install from Open VSX](${LINKS.OPEN_VSX}): the registry used by VSCodium and several VS Code-based editors
- [Source on GitHub](${LINKS.GITHUB})
- [Changelog](${ctx.origin}/changelog/)
`;
}

export function manifest() {
  return `${JSON.stringify(
    {
      name: "Claude Code Manager",
      short_name: "Claude Code Manager", // never "CC Manager": marketing/rename-seo-plan.md (kbwo's CCManager)
      description: "A VS Code sidebar for everything Claude Code keeps on your machine.",
      start_url: "/",
      display: "browser",
      background_color: "#0f0e0d",
      theme_color: "#0f0e0d",
      icons: [
        { src: "/assets/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/assets/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/assets/favicon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2,
  )}\n`;
}
