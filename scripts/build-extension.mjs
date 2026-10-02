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
  outfile: "dist/extension-main.js",
  external: ["vscode"],
  minify: true,
  sourcemap: "external",
  logLevel: "info",
};

/**
 * The entry VS Code loads (`main` in package.json). It resolves Claude
 * Code's config dir from the `claudeCode.environmentVariables` setting
 * before requiring the main bundle above, whose Claude paths are fixed
 * when it loads — see src/extension/entry.ts. The main bundle is external
 * so it is required at activation, not inlined and evaluated up front.
 */
const entryOpts = {
  entryPoints: ["src/extension/entry.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/extension.js",
  external: ["vscode", "./extension-main.js"],
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

/**
 * The statusline tap is a separate, self-contained Node script that
 * Claude Code spawns once per statusline render. It runs outside the
 * extension host, so it gets its own bundle (no `vscode`, no shared
 * runtime). The installer copies dist/statusline-tap.js to a stable
 * path under ~/.claude/ — see src/features/account/statuslineInstall.ts.
 */
const tapOpts = {
  entryPoints: ["src/features/account/statuslineTap.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/statusline-tap.js",
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

/**
 * SessionStart hook tap — a tiny Node script Claude CLI runs on every
 * session boot. Writes (sessionId, ppid, cwd) into a registry the host
 * watches to swap the row + detail action from Resume to View for the
 * terminal hosting that session. Same bundling rationale as the
 * statusline tap above.
 */
const sessionTapOpts = {
  entryPoints: ["src/features/sessions/sessionStartTap.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/session-start-tap.js",
  minify: true,
  sourcemap: false,
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  const entryCtx = await context(entryOpts);
  const tapCtx = await context(tapOpts);
  const sessionCtx = await context(sessionTapOpts);
  await Promise.all([ctx.watch(), entryCtx.watch(), tapCtx.watch(), sessionCtx.watch()]);
  console.log("build-extension: watching for changes…");
} else {
  await Promise.all([build(opts), build(entryOpts), build(tapOpts), build(sessionTapOpts)]);
}
