// Assembles every generated file of the site in memory. The CLI
// (scripts/build-site.mjs) writes the result to site/; the staleness test
// builds offline and compares it with what is committed.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { latestReleaseDate, renderChangelog } from "./changelog.mjs";
import { llms, manifest, robots, sitemap } from "./files.mjs";
import { esc, formatInt } from "./html.mjs";
import { fillTokens, hubList, installButtons, installCommand, renderPage } from "./layout.mjs";
import { readBuiltinCommands, readHookEvents } from "./srcdata.mjs";
import { pickVersion, totalDownloads } from "./stats.mjs";

/** site-src/pages/<file>.html for a slug: "" → home, "guides/x" → guides__x. */
export function bodyFile(slug) {
  return slug ? `${slug.replace(/\//g, "__")}.html` : "home.html";
}

/** Output path of a page relative to site/. */
export function outFile(page) {
  if (page.type === "notfound") return "404.html";
  return page.slug ? `${page.slug}/index.html` : "index.html";
}

/**
 * Last-modified date of a set of files from git: the newest commit date, or
 * today if any of them has uncommitted changes. Deterministic for a clean
 * checkout, which is what the staleness test and CI build from.
 */
export function gitLastmod(root, files, today) {
  const rel = files.filter(Boolean);
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", ...rel], {
      cwd: root,
      encoding: "utf8",
    });
    if (dirty.trim()) return today;
    const date = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...rel], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return date || today;
  } catch {
    return today;
  }
}

function commandsTable(commands) {
  const rows = commands
    .map(
      (c) =>
        `<tr><th scope="row"><code>${esc(c.name)}</code></th><td>${esc(c.description)}</td></tr>`,
    )
    .join("\n");
  return `<div class="table-wrap"><table class="data"><caption>Built-in Claude Code slash commands, as listed in the Commands tab (${commands.length})</caption><thead><tr><th scope="col">Command</th><th scope="col">What it does</th></tr></thead><tbody>
${rows}
</tbody></table></div>`;
}

function hooksTable(events) {
  const rows = events
    .map(
      (e) =>
        `<tr><th scope="row"><code>${esc(e.name)}</code></th><td>${esc(e.description)}</td></tr>`,
    )
    .join("\n");
  return `<div class="table-wrap"><table class="data"><caption>Hook events the Hooks tab's editor offers (${events.length})</caption><thead><tr><th scope="col">Event</th><th scope="col">When it fires</th></tr></thead><tbody>
${rows}
</tbody></table></div>`;
}

/**
 * Build every generated file. Returns a Map of path (relative to site/) → content.
 * `stats` is the resolved numbers (live or committed); `lastmodOf(files)` gives
 * the YYYY-MM-DD a page's sources last changed.
 */
export function buildSite({ root, stats, lastmodOf }) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const content = JSON.parse(read("site-src/pages.json"));
  const pkg = JSON.parse(read("package.json"));
  const changelogMd = read("CHANGELOG.md");
  const commands = readBuiltinCommands(read("src/features/commands/parser.ts"));
  const hookEvents = readHookEvents(read("src/features/hooks/events.ts"));

  const version = pickVersion(stats.publishedVersion, pkg.version);

  // Plain tokens first: page titles, descriptions and FAQs may use them, and
  // the hub lists below are built from those resolved fields.
  const tokens = {
    downloads: formatInt(totalDownloads(stats)),
    marketplaceInstalls: formatInt(stats.marketplaceInstalls),
    openVsxDownloads: formatInt(stats.openVsxDownloads),
    stars: formatInt(stats.stars),
    rating: String(stats.rating ?? ""),
    ratingCount: formatInt(stats.ratingCount ?? 0),
    version,
    commandsCount: String(commands.length),
    hookEventsCount: String(hookEvents.length),
    commandsTable: commandsTable(commands),
    hooksTable: hooksTable(hookEvents),
    changelog: renderChangelog(changelogMd),
    installButtons: installButtons(),
    installCommand: installCommand(),
  };
  const fill = (html) => fillTokens(html, tokens);
  const pages = content.pages.map((p) => ({
    ...p,
    title: fill(p.title),
    description: fill(p.description),
    lede: p.lede ? fill(p.lede) : "",
    faq: p.faq?.map((f) => ({ q: fill(f.q), a: fill(f.a) })),
  }));

  const sourcesOf = (page) => {
    const files = ["site-src/pages.json", `site-src/pages/${bodyFile(page.slug)}`];
    if (page.type === "changelog") files.push("CHANGELOG.md");
    if (page.slug === "commands") files.push("src/features/commands/parser.ts");
    if (page.slug === "hooks") files.push("src/features/hooks/events.ts");
    return files;
  };
  const lastmodCache = new Map();
  const ctx = {
    origin: content.site.origin,
    site: content.site,
    pages,
    stats,
    version,
    lastmod: (page) => {
      if (page.type === "changelog") return latestReleaseDate(changelogMd);
      if (!lastmodCache.has(page.slug)) lastmodCache.set(page.slug, lastmodOf(sourcesOf(page)));
      return lastmodCache.get(page.slug);
    },
  };
  for (const group of ["guides", "editors", "compare", "features"])
    tokens[`hub:${group}`] = hubList(ctx, group);

  const out = new Map();
  for (const page of pages) {
    const body = fill(read(`site-src/pages/${bodyFile(page.slug)}`));
    out.set(outFile(page), renderPage(ctx, page, body));
  }
  out.set("sitemap.xml", sitemap(ctx));
  out.set("robots.txt", robots(ctx));
  out.set("llms.txt", llms(ctx));
  out.set("site.webmanifest", manifest());
  out.set(`${content.site.indexNowKey}.txt`, `${content.site.indexNowKey}\n`);
  return { files: out, ctx };
}
