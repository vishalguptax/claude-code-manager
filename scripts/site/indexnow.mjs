#!/usr/bin/env node
// Tells IndexNow (Bing, Yandex and others) that the site's pages changed.
// Run by the Pages workflow after a deploy triggered by a push, never on the
// schedule: the cron rebuild only refreshes numbers, which isn't a content change.
//
//   node scripts/site/indexnow.mjs <path/to/sitemap.xml> <origin> <key>
//
// A non-2xx answer is a warning, not a failure: the deploy already succeeded.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The JSON body IndexNow expects, built from the sitemap's <loc> entries. */
export function indexNowPayload(sitemapXml, origin, key) {
  const urlList = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!urlList.length) throw new Error("indexnow: sitemap has no <loc> entries");
  return { host: new URL(origin).host, key, keyLocation: `${origin}/${key}.txt`, urlList };
}

async function main([sitemapPath, origin, key]) {
  const body = indexNowPayload(readFileSync(sitemapPath, "utf8"), origin, key);
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const line = `IndexNow: HTTP ${res.status} for ${body.urlList.length} URLs`;
  if (res.ok) console.log(line);
  else console.warn(`::warning title=IndexNow::${line} ${await res.text().catch(() => "")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) =>
    console.warn(`::warning title=IndexNow::${err.message}`),
  );
}
