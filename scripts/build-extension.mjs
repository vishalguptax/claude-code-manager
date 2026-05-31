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
  const tapCtx = await context(tapOpts);
  const sessionCtx = await context(sessionTapOpts);
  await Promise.all([ctx.watch(), tapCtx.watch(), sessionCtx.watch()]);
  console.log("build-extension: watching for changes…");
} else {
  await Promise.all([build(opts), build(tapOpts), build(sessionTapOpts)]);
}
