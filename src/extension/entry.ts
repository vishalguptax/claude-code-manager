/**
 * The extension's entry point (dist/extension.js): resolves where Claude Code
 * keeps its files, then loads the real extension (dist/extension-main.js).
 *
 * The split exists because the main bundle's Claude paths are module-level
 * constants, evaluated the moment the bundle is required. Reading the
 * `claudeCode.environmentVariables` setting needs `vscode`, which
 * src/core/config.ts may not import; so this bundle reads it first and
 * publishes the result, and only then requires the main bundle, whose
 * config module picks it up on load.
 */
import type * as vscode from "vscode";
import { publishClaudeEnv } from "../core/claudeHome";
import { hostClaudeEnv } from "./claudeConfigDir";

type MainModule = typeof import("./extension");

/** Wire the hand-off around `load`, which requires the main bundle. */
export function createEntry(load: () => MainModule): {
  activate(context: vscode.ExtensionContext): void;
  deactivate(): void;
} {
  let main: MainModule | undefined;
  return {
    activate(context) {
      publishClaudeEnv(hostClaudeEnv());
      main = load();
      main.activate(context);
    },
    deactivate() {
      main?.deactivate();
    },
  };
}

// A runtime require of a sibling file, kept out of this bundle by the build
// (scripts/build-extension.mjs marks it external).
const entry = createEntry(() => require("./extension-main.js") as MainModule);
export const activate = entry.activate;
export const deactivate = entry.deactivate;
