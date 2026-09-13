#!/usr/bin/env node
/**
 * Regenerate the marketing screenshots in site/assets/screenshots/ (which the
 * README links to as well) and the README's demo GIF.
 *
 * These are captures of the REAL extension. The previous generator wrote HTML
 * mock-ups that imitated the UI in the site's own palette, which meant the
 * published screenshots drifted from the product with every change and showed
 * controls — an orange "Resume" button, a clay segmented control — that the
 * extension has never rendered. This runs the actual webview bundle against a
 * stubbed host instead, so a screenshot cannot be wrong without the product
 * being wrong.
 *
 * The stub host (scripts/screenshot-fixtures.js) answers with entirely
 * FICTIONAL data — "Alex Rivera" working on invented "acme-*" repositories —
 * so nobody's real account, projects, paths or usage figures are published.
 *
 * Output is 1520x2256: the panel at 380x564 CSS captured at 4x, which matches
 * the width/height attributes the site's <img> tags already declare.
 *
 * Usage:  pnpm run build && node scripts/generate-screenshots.mjs
 * Needs:  Google Chrome. ffmpeg is optional — without it the GIF is skipped.
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "webview");
const SHOTS = join(ROOT, "site", "assets", "screenshots");

/** Panel size in CSS pixels, and the factor it is captured at. */
const WIDTH = 380;
const HEIGHT = 564;
const SCALE = 4;

/** Output name → tab id, in the order the site presents them. */
const TABS = [
  ["01-sessions", "sessions"],
  ["02-skills", "skills"],
  ["03-commands", "commands"],
  ["04-hooks", "hooks"],
  ["05-mcp", "mcp"],
  ["06-agents", "agents"],
  ["07-account", "account"],
  ["08-config", "config"],
];

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * The page the capture loads: VS Code's Dark Modern theme variables, the view
 * title VS Code draws above a webview, and the real bundle beneath it.
 *
 * The body is pinned to the panel's exact size rather than the viewport.
 * Headless Chrome lays a page out at its own default width and then captures a
 * `--window-size` region, so a viewport-relative body renders at 800px and is
 * cropped to 380 — which silently cut the toolbar's trailing icons off every
 * shot until the size was pinned here.
 */
function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>shot-loading</title>
<link rel="stylesheet" href="./styles.css">
<style>
  :root {
    --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --vscode-editor-font-family: "SF Mono", Menlo, monospace;
    --vscode-font-size: 13px;
    --vscode-sideBar-background: #181818;
    --vscode-editor-background: #1f1f1f;
    --vscode-sideBar-foreground: #cccccc;
    --vscode-editor-foreground: #cccccc;
    --vscode-foreground: #cccccc;
    --vscode-descriptionForeground: #9d9d9d;
    --vscode-disabledForeground: #767676;
    --vscode-icon-foreground: #cccccc;
    --vscode-sideBarSectionHeader-foreground: #cccccc;
    --vscode-sideBarSectionHeader-border: #2b2b2b;
    --vscode-panel-border: #2b2b2b;
    --vscode-panelTitle-activeForeground: #e7e7e7;
    --vscode-panelTitle-inactiveForeground: #8b8b8b;
    --vscode-panelTitle-activeBorder: #0078d4;
    --vscode-list-hoverBackground: #2a2d2e;
    --vscode-list-activeSelectionBackground: #04395e;
    --vscode-list-activeSelectionForeground: #ffffff;
    --vscode-focusBorder: #0078d4;
    --vscode-badge-background: #616161;
    --vscode-badge-foreground: #f8f8f8;
    --vscode-input-background: #313131;
    --vscode-input-foreground: #cccccc;
    --vscode-input-border: #3c3c3c;
    --vscode-button-background: #0078d4;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #026ec1;
    --vscode-button-secondaryBackground: #313131;
    --vscode-button-secondaryForeground: #cccccc;
    --vscode-button-border: #3c3c3c;
    --vscode-textLink-foreground: #4daafc;
    --vscode-errorForeground: #f85149;
    --vscode-dropdown-background: #313131;
    --vscode-dropdown-border: #3c3c3c;
    --vscode-menu-background: #1f1f1f;
    --vscode-menu-border: #454545;
    --vscode-menu-foreground: #cccccc;
    --vscode-toolbar-hoverBackground: #2a2d2e;
    --vscode-toolbar-activeBackground: #383838;
    --vscode-scrollbarSlider-background: #79797966;
    --vscode-editorWidget-background: #202020;
    --vscode-editorHoverWidget-background: #202020;
    --vscode-editorHoverWidget-border: #454545;
    --vscode-progressBar-background: #0078d4;
    --vscode-textCodeBlock-background: #2a2a2a;
    --vscode-testing-iconPassed: #3fb950;
    --vscode-editorWarning-foreground: #cca700;
    --vscode-editorError-foreground: #f14c4c;
  }
  html, body { margin: 0; padding: 0; }
  html { background: var(--vscode-sideBar-background); }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background: var(--vscode-sideBar-background);
    color: var(--vscode-sideBar-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  * { box-sizing: border-box; }
  /* VS Code draws this above the webview; the panel shots have always included
     it so the image reads as the real sidebar rather than a floating panel. */
  .viewtitle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    height: 35px;
    padding: 0 14px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground);
  }
  /* The app's own rule is height:100vh, which would ignore the title bar. */
  #root { flex: 1 1 auto; min-height: 0; height: auto !important; display: flex; flex-direction: column; }
</style>
</head>
<body class="vscode-dark">
  <div class="viewtitle">Claude Code Manager</div>
  <div id="root"></div>
  <script src="./fixtures.js"></script>
  <script type="module" src="./main.js"></script>
  <script>
  /* Select the tab named in ?tab= and report readiness through the document
     title, so a capture can tell "painted" from "still mounting". */
  (function () {
    var want = new URLSearchParams(location.search).get("tab") || "sessions";
    var deadline = Date.now() + 15000;
    (function poll() {
      var btn = document.querySelector('.tab-btn[data-tab="' + want + '"]');
      var active = document.querySelector('.tab-btn.active');
      if (!btn) {
        if (Date.now() < deadline) return setTimeout(poll, 60);
        document.title = "shot-failed";
        return;
      }
      if (!active || active.dataset.tab !== want) {
        btn.click();
        return setTimeout(poll, 120);
      }
      setTimeout(function () {
        var busy = document.querySelector('.skeleton, .host-busy-bar, .loading');
        if (busy && Date.now() < deadline) return setTimeout(poll, 120);
        document.title = "shot-ready";
      }, 400);
    })();
  })();
  </script>
</body>
</html>
`;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
};

/** Serve `dir` on an ephemeral port; resolves with the port. */
function serve(dir) {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const file = join(dir, path === "/" ? "/index.html" : path);
      // The served tree is one we just wrote, but keep requests inside it.
      if (!file.startsWith(dir)) {
        res.writeHead(403).end();
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port }));
  });
}

async function main() {
  if (!existsSync(join(DIST, "main.js"))) {
    throw new Error("dist/webview is missing — run `pnpm run build` first.");
  }
  if (!existsSync(CHROME)) {
    throw new Error(`Chrome not found at ${CHROME} — set CHROME_PATH.`);
  }

  const work = await mkdtemp(join(tmpdir(), "cm-shots-"));
  const raw = join(work, "raw");
  await mkdir(raw, { recursive: true });

  // The real bundle, the stub host, and the page that puts them together.
  await copyFile(join(DIST, "main.js"), join(work, "main.js"));
  await copyFile(join(DIST, "styles.css"), join(work, "styles.css"));
  await cp(join(DIST, "chunks"), join(work, "chunks"), { recursive: true });
  await copyFile(join(ROOT, "scripts", "screenshot-fixtures.js"), join(work, "fixtures.js"));
  await writeFile(join(work, "index.html"), page());

  const { server, port } = await serve(work);
  try {
    for (const [name, tab] of TABS) {
      const png = join(raw, `${name}.png`);
      await execFileAsync(CHROME, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--force-device-scale-factor=${SCALE}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        "--virtual-time-budget=8000",
        `--screenshot=${png}`,
        `http://127.0.0.1:${port}/index.html?tab=${tab}`,
      ]).catch(() => {
        // Chrome exits non-zero on harmless macOS task-policy warnings; the
        // screenshot is still written, so judge it by the file below.
      });
      if (!existsSync(png)) throw new Error(`capture failed for ${tab}`);

      const out = join(SHOTS, `${name}.webp`);
      await sharp(png).webp({ quality: 82, effort: 6 }).toFile(`${out}.tmp`);
      await rename(`${out}.tmp`, out);
      const { width, height } = await sharp(out).metadata();
      console.log(`${name}.webp  ${width}x${height}`);
    }

    await buildGif(raw);
  } finally {
    server.close();
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * The README's demo: a tour of the tabs built from the same captures, so it
 * cannot disagree with them. The previous GIF was a screen recording of a real
 * machine, which published a real repository's file tree.
 */
async function buildGif(raw) {
  const list = join(raw, "frames.txt");
  const lines = [];
  for (const [name] of TABS) {
    lines.push(`file '${join(raw, `${name}.png`)}'`, "duration 1.7");
  }
  // concat needs the final frame repeated for its duration to be honoured.
  lines.push(`file '${join(raw, `${TABS[TABS.length - 1][0]}.png`)}'`);
  await writeFile(list, `${lines.join("\n")}\n`);

  const gif = join(ROOT, "media", "demo.gif");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      "-vf",
      "scale=440:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      "-loop", "0",
      gif,
    ]);
    console.log("media/demo.gif");
  } catch {
    console.log("ffmpeg not available — skipped media/demo.gif");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
