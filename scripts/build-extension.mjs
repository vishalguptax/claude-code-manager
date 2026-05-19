#!/usr/bin/env node
/**
 * esbuild config for extension host bundle.
 * CJS for VS Code, node20 target, externalizes vscode.
 */
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: ["src/extension/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/extension.js",
  external: ["vscode"],
  minify: true,
  sourcemap: "external",
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("build-extension: watching for changes…");
} else {
  await build(opts);
}
