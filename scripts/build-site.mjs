#!/usr/bin/env node
// Builds the static site in site/ from site-src/ (page table + bodies), the
// changelog and two lists in the extension's source. No dependencies.
//
//   node scripts/build-site.mjs            fetch live numbers, write site/
//   node scripts/build-site.mjs --offline  use site-src/stats.json instead of fetching
//   node scripts/build-site.mjs --og       also regenerate the social cards (needs Chrome)
//   node scripts/build-site.mjs --report   print title/description lengths per page
//   node scripts/build-site.mjs --save-stats  write fetched numbers back to site-src/stats.json
//
// The generated pages are not committed (see .gitignore): the Pages workflow
// builds them at deploy with live numbers. site-src/stats.json is the committed
// fallback for a failed fetch, refreshed with --save-stats.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, gitLastmod } from "./site/build.mjs";
import { generateCards } from "./site/og.mjs";
import { DESCRIPTION_MAX, TITLE_MAX } from "./site/seo.mjs";
import { resolveStats } from "./site/stats.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = join(root, "site");
const args = new Set(process.argv.slice(2));
const inCI = Boolean(process.env.GITHUB_ACTIONS);

// A fallback in CI must be visible on a green run, so it is printed as an
// Actions warning annotation rather than a plain log line.
const warn = (msg) => console.warn(inCI ? `::warning title=build-site::${msg}` : `warning: ${msg}`);

const statsPath = join(root, "site-src/stats.json");
const fallback = JSON.parse(readFileSync(statsPath, "utf8"));
const stats = args.has("--offline") ? { ...fallback } : await resolveStats({ fallback, warn });

// Local date, to match git's %cs (committer date in the committer's zone).
const today = new Date().toLocaleDateString("sv-SE");
const { files, ctx } = buildSite({
  root,
  stats,
  lastmodOf: (sources) => gitLastmod(root, sources, today),
});

for (const [rel, text] of files) {
  const dest = join(siteDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
}
console.log(
  `wrote ${files.size} files (v${ctx.version}, ${stats.marketplaceInstalls} + ${stats.openVsxDownloads} downloads, ${stats.stars} stars)`,
);

if (args.has("--save-stats")) {
  const {
    marketplaceInstalls,
    openVsxDownloads,
    stars,
    rating,
    ratingCount,
    marketplaceVersion,
    openVsxVersion,
    publishedVersion,
  } = stats;
  writeFileSync(
    statsPath,
    `${JSON.stringify({ marketplaceInstalls, openVsxDownloads, stars, rating, ratingCount, marketplaceVersion, openVsxVersion, publishedVersion, asOf: today }, null, 2)}\n`,
  );
  console.log("saved numbers to site-src/stats.json");
}

if (args.has("--og") || inCI) {
  const { made, kept, missing } = generateCards({
    pages: ctx.pages,
    siteDir,
    version: ctx.version,
    warn,
  });
  console.log(`social cards: ${made.length} rendered, ${kept.length} kept`);
  if (missing.length) {
    console.error(`no social card for: ${missing.join(", ")}`);
    process.exit(1);
  }
}

if (args.has("--report")) {
  for (const p of ctx.pages) {
    const t = p.title.length;
    const d = p.description.length;
    const flag = t > TITLE_MAX || d > DESCRIPTION_MAX ? "  <-- over" : "";
    console.log(
      `${(p.slug || "/").padEnd(44)} title ${String(t).padStart(2)}  desc ${String(d).padStart(3)}${flag}`,
    );
  }
}
