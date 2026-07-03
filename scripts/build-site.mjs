#!/usr/bin/env node
// Bakes the live combined download count (VS Code Marketplace + Open VSX)
// into site/index.html as static text — best for SEO (number is in the markup,
// no client fetch, no layout shift). Run by the Pages workflow on every deploy.
// No dependencies: uses Node 20+ global fetch. On any fetch failure it keeps the
// last-committed number rather than zeroing it out.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = join(__dirname, "..", "site", "index.html");
const PUBLISHER = "vishalguptax";
const NAME = "claude-manager";
const EXT_ID = `${PUBLISHER}.${NAME}`;

async function marketplaceInstalls() {
  const res = await fetch(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        Accept: "application/json;api-version=7.2-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: EXT_ID }] }],
        flags: 914, // IncludeStatistics
      }),
    },
  );
  if (!res.ok) throw new Error(`marketplace ${res.status}`);
  const data = await res.json();
  const stats = data.results?.[0]?.extensions?.[0]?.statistics ?? [];
  const installs = stats.find((s) => s.statisticName === "install")?.value;
  if (typeof installs !== "number") throw new Error("marketplace: no install stat");
  return Math.round(installs);
}

async function openVsxDownloads() {
  const res = await fetch(`https://open-vsx.org/api/${PUBLISHER}/${NAME}`);
  if (!res.ok) throw new Error(`openvsx ${res.status}`);
  const data = await res.json();
  if (typeof data.downloadCount !== "number") throw new Error("openvsx: no downloadCount");
  return data.downloadCount;
}

async function githubStars() {
  const res = await fetch("https://api.github.com/repos/vishalguptax/claude-code-manager", {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`github ${res.status}`);
  const data = await res.json();
  if (typeof data.stargazers_count !== "number") throw new Error("github: no stargazers_count");
  return data.stargazers_count;
}

function bakeCounter(html, className, value) {
  const pretty = value.toLocaleString("en-US");
  // Tag-agnostic: the counters are <strong> in the markup, not <span>.
  // Match any single element tag and close it generically so the bake
  // can't silently no-op again if the tag changes.
  const re = new RegExp(
    `(<[a-z]+ class="${className}"[^>]*data-target=")\\d+("[^>]*data-final=")[\\d,]+("[^>]*>)[\\d,]+(</[a-z]+>)`,
    "g",
  );
  return html.replace(re, `$1${value}$2${pretty}$3${pretty}$4`);
}

async function main() {
  let html = await readFile(HTML, "utf8");
  let changed = false;

  // Combined downloads (Marketplace + Open VSX).
  try {
    const [mp, ovsx] = await Promise.all([marketplaceInstalls(), openVsxDownloads()]);
    const total = mp + ovsx;
    html = bakeCounter(html, "counter", total);
    changed = true;
    console.log(`marketplace=${mp} openvsx=${ovsx} downloads=${total}`);
  } catch (err) {
    console.warn(`download fetch failed (${err.message}); keeping committed number`);
  }

  // GitHub stars (independent — a failure here must not block downloads).
  try {
    const stars = await githubStars();
    html = bakeCounter(html, "gh-stars", stars);
    changed = true;
    console.log(`stars=${stars}`);
  } catch (err) {
    console.warn(`stars fetch failed (${err.message}); keeping committed number`);
  }

  if (changed) {
    await writeFile(HTML, html);
    console.log("baked live counts into site/index.html");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
