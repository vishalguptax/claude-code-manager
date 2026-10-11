// Page chrome shared by every page: header, breadcrumb, page hero, FAQ,
// related links, install band and footer. Bodies come from site-src/pages/*.html;
// this module wraps them. Pure string rendering.

import { esc, formatInt, pathOf } from "./html.mjs";
import { LINKS, renderHead } from "./seo.mjs";

const GROUPS = [
  ["features", "Features"],
  ["guides", "Guides"],
  ["editors", "Editors"],
  ["compare", "Compare"],
];

const NAV = [
  ["/#features", "Features"],
  ["/guides/", "Guides"],
  ["/editors/", "Editors"],
  ["/compare/", "Compare"],
  ["/changelog/", "Changelog"],
];

/**
 * Replace {{token}} placeholders in a body. Unknown tokens throw so a typo
 * can't ship as literal braces on a live page.
 */
export function fillTokens(html, tokens) {
  return html.replace(/\{\{([\w:-]+)\}\}/g, (_, key) => {
    if (!(key in tokens)) throw new Error(`unknown token {{${key}}}`);
    return tokens[key];
  });
}

function link(ctx, slug) {
  const p = ctx.pages.find((x) => x.slug === slug);
  if (!p) throw new Error(`link to unknown page "${slug}"`);
  return p;
}

const navLinks = (current) =>
  NAV.map(([href, label]) => {
    const here = current.startsWith(href) && href !== "/#features";
    return `<a href="${href}"${here ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");

function header(page) {
  const current = pathOf(page.slug);
  return `<header class="site-header">
  <a class="brand" href="/"><img src="/assets/favicon.svg" width="24" height="24" alt=""><span>Claude Code Manager</span></a>
  <nav class="nav" aria-label="Primary">${navLinks(current)}</nav>
  <div class="header-actions">
    <button class="theme-toggle" type="button" hidden aria-label="Switch colour theme"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="currentColor"/></svg></button>
    <a class="btn btn-small btn-accent" href="${LINKS.MARKETPLACE}">Install</a>
    <details class="menu">
      <summary aria-label="Menu"><span></span><span></span></summary>
      <nav aria-label="Mobile">${navLinks(current)}</nav>
    </details>
  </div>
</header>`;
}

function crumbs(ctx, page) {
  const parent = page.parent ? link(ctx, page.parent) : null;
  const mid = parent ? `<li><a href="${pathOf(parent.slug)}">${esc(parent.crumb)}</a></li>` : "";
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li>${mid}<li aria-current="page">${esc(page.crumb)}</li></ol></nav>`;
}

export function installButtons() {
  return `<div class="cta-row">
  <a class="btn btn-accent" href="${LINKS.MARKETPLACE}">Install from the Marketplace</a>
  <a class="btn btn-line" href="${LINKS.OPEN_VSX}">Get it on Open VSX</a>
</div>`;
}

export function installCommand() {
  const cmd = "code --install-extension vishalguptax.claude-manager";
  return `<div class="cmd" role="group" aria-label="Command-line install"><span class="cmd-prompt" aria-hidden="true">$</span><code>${cmd}</code><button class="copy" type="button" data-copy="${cmd}" hidden>Copy</button></div>`;
}

function pageHero(page) {
  const shot = page.shot
    ? `<figure class="hero-shot"><img src="${page.shot.src.replace(".webp", "-560.webp")}" srcset="${page.shot.src.replace(".webp", "-560.webp")} 560w, ${page.shot.src} 1520w" sizes="(max-width: 820px) 300px, 340px" width="760" height="1128" alt="${esc(page.shot.alt)}" fetchpriority="high"></figure>`
    : "";
  const eyebrow = page.eyebrow ? `<p class="callno">${esc(page.eyebrow)}</p>` : "";
  const cta = page.type === "hub" || page.type === "changelog" ? "" : installButtons();
  return `<section class="page-hero${shot ? " has-shot" : ""}">
  <div class="page-hero-copy">
    ${eyebrow}
    <h1>${page.h1}</h1>
    <p class="lede">${page.lede}</p>
    ${cta}
  </div>
  ${shot}
</section>`;
}

function faq(page) {
  if (!page.faq?.length) return "";
  const items = page.faq
    .map((f) => `<details><summary>${f.q}</summary><div>${f.a}</div></details>`)
    .join("\n");
  return `<section class="block faq" aria-labelledby="faq-h">
  <p class="callno">FAQ</p>
  <h2 id="faq-h">${esc(page.faqTitle ?? "Questions, answered")}</h2>
  <div class="faq-list">${items}</div>
</section>`;
}

function related(ctx, page) {
  if (!page.related?.length) return "";
  const cards = page.related
    .map((slug) => {
      const p = link(ctx, slug);
      return `<li><a href="${pathOf(slug)}"><span class="callno">${esc(p.eyebrow ?? p.crumb)}</span><strong>${esc(p.crumb)}</strong><span>${esc(p.summary ?? p.description)}</span></a></li>`;
    })
    .join("");
  return `<section class="block related" aria-labelledby="rel-h">
  <h2 id="rel-h">Related</h2>
  <ul class="cards">${cards}</ul>
</section>`;
}

function installBand(ctx) {
  return `<section class="band" aria-labelledby="band-h">
  <h2 id="band-h">Free, open source, <em class="serif">and it stays on your machine.</em></h2>
  <p>Apache-2.0. No telemetry, no account, no network client. Works with the Claude Code CLI and the official extension.</p>
  ${installButtons()}
  ${installCommand()}
</section>`;
}

function footer(ctx) {
  const cols = GROUPS.map(([group, label]) => {
    const items = ctx.pages
      .filter((p) => p.group === group && p.type !== "hub")
      .map((p) => `<li><a href="${pathOf(p.slug)}">${esc(p.crumb)}</a></li>`)
      .join("");
    return `<div><h2>${label}</h2><ul>${items}</ul></div>`;
  }).join("\n");
  const s = ctx.stats;
  return `<footer class="site-footer">
  <div class="footer-cols">
${cols}
  <div><h2>Project</h2><ul>
    <li><a href="${LINKS.MARKETPLACE}">VS Code Marketplace</a></li>
    <li><a href="${LINKS.OPEN_VSX}">Open VSX</a></li>
    <li><a href="${LINKS.GITHUB}">GitHub</a></li>
    <li><a href="/changelog/">Changelog</a></li>
    <li><a href="https://github.com/sponsors/vishalguptax">Sponsor</a></li>
    <li><a href="/llms.txt">llms.txt</a></li>
  </ul></div>
  </div>
  <p class="proof"><span><strong>${formatInt(s.marketplaceInstalls + s.openVsxDownloads)}</strong> downloads</span><span><strong>${formatInt(s.stars)}</strong> GitHub stars</span><span>v${esc(ctx.version)}</span><span>Apache-2.0</span></p>
  <p class="fine">Built by <a href="https://vishalg.in">Vishal Gupta</a>. An independent community project, not affiliated with or endorsed by Anthropic. <em>Claude</em> and <em>Claude Code</em> are trademarks of Anthropic, PBC.</p>
</footer>`;
}

/** A complete HTML document for one page. */
export function renderPage(ctx, page, body) {
  const isHome = page.type === "home";
  const main = isHome
    ? `${body}\n${faq(page)}\n${installBand(ctx)}`
    : page.type === "notfound"
      ? `${pageHero(page)}\n${body}`
      : `${crumbs(ctx, page)}\n${pageHero(page)}\n${body}\n${faq(page)}\n${related(ctx, page)}\n${installBand(ctx)}`;
  return `<!doctype html>
<html lang="en">
<head>
${renderHead(ctx, page)}
</head>
<body class="t-${page.type}">
<a class="skip" href="#main">Skip to content</a>
${header(page)}
<main id="main">
${main}
</main>
${footer(ctx)}
<script src="/assets/js/site.js" defer></script>
</body>
</html>
`;
}

/** The link list for a hub page (Guides, Editors, Compare). */
export function hubList(ctx, group) {
  const items = ctx.pages
    .filter((p) => p.group === group && p.type !== "hub")
    .map(
      (p) =>
        `<li><a href="${pathOf(p.slug)}"><span class="callno">${esc(p.eyebrow ?? "")}</span><strong>${esc(p.crumb)}</strong><span>${esc(p.summary ?? p.description)}</span></a></li>`,
    )
    .join("");
  return `<ul class="cards cards-wide">${items}</ul>`;
}
