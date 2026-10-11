// 1200×630 social cards, one per page, in the site's style. The card is plain
// HTML rendered by headless Chrome (`--screenshot`): no dependencies, and the
// cards stay in sync with page titles because they are regenerated from them.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { esc } from "./html.mjs";
import { headline, ogName } from "./seo.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", // preinstalled on GitHub's ubuntu-latest runners
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function findChrome() {
  return CHROME_CANDIDATES.find((p) => p && existsSync(p)) ?? null;
}

/** Self-contained card HTML. `fontDir` is an absolute path to site/assets/fonts. */
export function cardHtml(page, { fontDir, version }) {
  const kicker = page.og?.kicker ?? page.eyebrow ?? "~/.claude";
  const title = page.og?.title ?? headline(page);
  const font = (file) => `url("file://${fontDir}/${file}") format("woff2")`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;font-weight:400 800;src:${font("inter-latin.woff2")}}
@font-face{font-family:Mono;font-weight:400 600;src:${font("jetbrains-mono-latin.woff2")}}
@font-face{font-family:Serif;font-style:italic;src:${font("instrument-serif-italic-latin.woff2")}}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:#0f0e0d;color:#f3efe9;font-family:Inter,sans-serif;position:relative;
  background-image:linear-gradient(#ffffff0d 1px,transparent 1px),linear-gradient(90deg,#ffffff0d 1px,transparent 1px);
  background-size:60px 60px;background-position:-1px -1px}
.rule{position:absolute;left:72px;right:72px;height:2px;background:#d97757}
.top{top:72px}
.kicker{position:absolute;left:72px;top:104px;font:500 26px Mono,monospace;color:#e2a184;font-variant-ligatures:none;letter-spacing:-.01em}
h1{position:absolute;left:72px;right:72px;top:168px;font-weight:800;font-size:${title.length > 48 ? 66 : 78}px;line-height:1.02;letter-spacing:-.035em}
.foot{position:absolute;left:72px;right:72px;bottom:64px;display:flex;align-items:center;gap:18px;font:600 28px Inter,sans-serif}
.foot img{width:48px;height:48px}
.foot span{color:#a8a199;font:500 22px Mono,monospace;margin-left:auto;font-variant-ligatures:none}
.led{display:inline-block;width:12px;height:12px;border-radius:50%;background:#57b88a;box-shadow:0 0 0 5px #57b88a33;margin-right:12px;vertical-align:middle}
</style></head><body>
<div class="rule top"></div>
<p class="kicker"><i class="led"></i>${esc(kicker)}</p>
<h1>${esc(title)}</h1>
<div class="foot"><img src="file://${fontDir}/../favicon.svg" alt="">Claude Code Manager<span>VS Code · free · v${esc(version)}</span></div>
</body></html>`;
}

/**
 * Render every page's card into site/assets/og/. Writes to a temp file, checks
 * it is a non-empty PNG, then moves it into place, so a crashed Chrome can't
 * leave a broken image behind. Returns { made, kept, missing } page names.
 */
export function generateCards({ pages, siteDir, version, warn }) {
  const chrome = findChrome();
  const fontDir = join(siteDir, "assets/fonts");
  const outDir = join(siteDir, "assets/og");
  const made = [];
  const kept = [];
  if (!chrome) warn("Chrome not found; keeping the existing social cards");
  const work = mkdtempSync(join(tmpdir(), "ccm-og-"));
  try {
    for (const page of pages) {
      const name = ogName(page.slug);
      const target = join(outDir, `${name}.png`);
      if (!chrome) {
        if (existsSync(target)) kept.push(name);
        continue;
      }
      const html = join(work, `${name}.html`);
      const png = join(work, `${name}.png`);
      writeFileSync(html, cardHtml(page, { fontDir, version }));
      try {
        execFileSync(
          chrome,
          [
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--window-size=1200,630",
            "--allow-file-access-from-files",
            "--virtual-time-budget=2000",
            `--screenshot=${png}`,
            `file://${html}`,
          ],
          { stdio: "ignore", timeout: 60_000 },
        );
      } catch (err) {
        warn(`Chrome failed on ${name} (${err.message}); keeping the existing card`);
      }
      if (existsSync(png) && statSync(png).size > 1000) {
        renameSync(png, target);
        made.push(name);
      } else if (existsSync(target)) {
        kept.push(name);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const missing = pages
    .map((p) => ogName(p.slug))
    .filter((n) => !existsSync(join(outDir, `${n}.png`)));
  return { made, kept, missing };
}
