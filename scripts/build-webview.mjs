#!/usr/bin/env node
/**
 * esbuild config for webview bundle.
 * ESM modules + dynamic import code-splitting for per-feature lazy load.
 * chrome120 target aligns with VS Code 1.90+ Electron runtime.
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

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
