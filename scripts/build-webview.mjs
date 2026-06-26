#!/usr/bin/env node
/**
 * esbuild config for webview bundle.
 * ESM modules + dynamic import code-splitting for per-feature lazy load.
 * chrome120 target aligns with VS Code 1.90+ Electron runtime.
 */
import { build, context } from "esbuild";
import { rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

// Purge prior output before rebuilding. esbuild emits content-hashed chunk
// files (chunks/[name]-[hash]) and never deletes superseded ones, so without
// this every rebuild leaves orphaned chunks behind — they pile up in dist/
// and, since .vscodeignore only excludes *.map, get packaged into the .vsix,
// bloating the extension. Clearing the dir keeps only the live graph.
rmSync("dist/webview", { recursive: true, force: true });

const opts = {
  entryPoints: ["src/webview/app/main.tsx"],
  bundle: true,
  platform: "browser",
  target: "chrome120",
  format: "esm",
  outdir: "dist/webview",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  jsx: "automatic",
  jsxImportSource: "preact",
  minify: true,
  sourcemap: "external",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("build-webview: watching for changes…");
} else {
  await build(opts);
}
