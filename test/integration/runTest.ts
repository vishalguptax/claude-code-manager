/**
 * Entry point for the @vscode/test-electron integration suite. Downloads a
 * pinned VS Code build, installs this extension into a throwaway profile,
 * and runs the Mocha suite (compiled to ./out/test/integration/suite) inside
 * the real Extension Host.
 *
 * Run via `npm run test:integration` after `npm run build` +
 * `npm run compile:integration`.
 */
import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  try {
    // The repo root. Compiled layout: out/integration/runTest.js, so two
    // levels up is the repo root. package.json `main` points at
    // dist/extension.js, which must be built beforehand.
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Disable other extensions + a fresh user-data-dir so the run is
      // deterministic and never inherits a developer's local profile.
      launchArgs: ["--disable-extensions", "--disable-gpu"],
    });
  } catch (err) {
    console.error("Integration tests failed:", err);
    process.exit(1);
  }
}

void main();
