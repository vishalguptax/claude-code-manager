// <head> and JSON-LD for one page. Pure: everything comes from the page record
// (site-src/pages.json) and the build context (origin, version, lastmod, stats).

import { esc, pathOf, strip } from "./html.mjs";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

const MARKETPLACE =
  "https://marketplace.visualstudio.com/items?itemName=vishalguptax.claude-manager";
const OPEN_VSX = "https://open-vsx.org/extension/vishalguptax/claude-manager";
const GITHUB = "https://github.com/vishalguptax/claude-code-manager";

export const LINKS = { MARKETPLACE, OPEN_VSX, GITHUB };

/** Public file name of a page's social card: "" → "home", "guides/x" → "guides-x". */
export function ogName(slug) {
  return slug ? slug.replace(/\//g, "-") : "home";
}

export function pageUrl(ctx, slug) {
  return ctx.origin + pathOf(slug);
}

function ogImage(ctx, page) {
  return `${ctx.origin}/assets/og/${ogName(page.slug)}.png`;
}

/** Plain-text h1, used as the card alt text and the article headline. */
export function headline(page) {
  return strip(page.h1 ?? page.title);
}

function breadcrumb(ctx, page) {
  const items = [{ name: "Claude Code Manager", item: `${ctx.origin}/` }];
  const parent = page.parent && ctx.pages.find((p) => p.slug === page.parent);
  if (parent) items.push({ name: parent.crumb, item: pageUrl(ctx, parent.slug) });
  items.push({ name: page.crumb, item: pageUrl(ctx, page.slug) });
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl(ctx, page.slug)}#breadcrumb`,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, ...it })),
  };
}

function app(ctx) {
  return {
    "@type": "SoftwareApplication",
    "@id": `${ctx.origin}/#app`,
    name: "Claude Code Manager",
    alternateName: "Claude Manager",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "VS Code extension",
    operatingSystem: "Windows, macOS, Linux",
    softwareVersion: ctx.version,
    description: ctx.site.appDescription,
    url: `${ctx.origin}/`,
    downloadUrl: MARKETPLACE,
    installUrl: MARKETPLACE,
    softwareRequirements: "VS Code 1.90 or later (or a compatible editor) and Claude Code",
    screenshot: `${ctx.origin}/assets/screenshots/01-sessions.webp`,
    license: "https://www.apache.org/licenses/LICENSE-2.0",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@id": `${ctx.origin}/#author` },
    sameAs: [GITHUB, MARKETPLACE, OPEN_VSX],
  };
}

/** The JSON-LD @graph for a page. */
export function jsonLd(ctx, page) {
  const url = pageUrl(ctx, page.slug);
  const isHome = page.type === "home";
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${ctx.origin}/#website`,
      name: "Claude Code Manager",
      url: `${ctx.origin}/`,
      inLanguage: "en",
      publisher: { "@id": `${ctx.origin}/#author` },
    },
    {
      "@type": "Person",
      "@id": `${ctx.origin}/#author`,
      name: "Vishal Gupta",
      url: "https://vishalg.in",
    },
    app(ctx),
  ];

  const webPage = {
    "@type": page.type === "hub" ? "CollectionPage" : "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": `${ctx.origin}/#website` },
    about: { "@id": `${ctx.origin}/#app` },
    dateModified: ctx.lastmod(page),
    primaryImageOfPage: {
      "@type": "ImageObject",
      url: ogImage(ctx, page),
      width: 1200,
      height: 630,
    },
  };
  if (!isHome) webPage.breadcrumb = { "@id": `${url}#breadcrumb` };
  graph.push(webPage);
  if (!isHome) graph.push(breadcrumb(ctx, page));

  if (page.type === "guide") {
    graph.push({
      "@type": "TechArticle",
      "@id": `${url}#article`,
      headline: headline(page),
      description: page.description,
      mainEntityOfPage: { "@id": `${url}#webpage` },
      dateModified: ctx.lastmod(page),
      author: { "@id": `${ctx.origin}/#author` },
      publisher: { "@id": `${ctx.origin}/#author` },
      image: ogImage(ctx, page),
      about: { "@id": `${ctx.origin}/#app` },
    });
  }

  if (isHome && ctx.site.video) {
    const v = ctx.site.video;
    graph.push({
      "@type": "VideoObject",
      "@id": `${ctx.origin}/#tour`,
      name: v.name,
      description: v.description,
      thumbnailUrl: `${ctx.origin}${v.poster}`,
      contentUrl: `${ctx.origin}${v.mp4}`,
      uploadDate: v.uploadDate,
      duration: v.duration,
    });
  }

  if (page.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: strip(f.q),
        acceptedAnswer: { "@type": "Answer", text: strip(f.a) },
      })),
    });
  }

  // "</" inside a JSON string would close the <script> early.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2).replace(
    /<\//g,
    "<\\/",
  );
}

/** Everything inside <head>. */
export function renderHead(ctx, page) {
  const url = pageUrl(ctx, page.slug);
  const img = ogImage(ctx, page);
  const alt = page.og?.alt ?? `${headline(page)} — Claude Code Manager`;
  const ogType = page.type === "guide" ? "article" : "website";
  const robots =
    page.type === "notfound"
      ? ""
      : '\n<meta name="robots" content="index, follow, max-image-preview:large">';
  const canonical = page.type === "notfound" ? "" : `\n<link rel="canonical" href="${url}">`;
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">${robots}${canonical}
<meta name="theme-color" content="#f6f3ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f0e0d" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Claude Code Manager">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:image:alt" content="${esc(alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${esc(alt)}">
<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
<script>try{var t=localStorage.getItem("ccm-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<script type="application/ld+json">
${jsonLd(ctx, page)}
</script>`;
}
