/**
 * Mocha bootstrap that runs inside the Extension Host. @vscode/test-electron
 * imports this module's `run()` after the host has activated.
 */
import * as path from "path";
import { glob } from "glob";
import Mocha from "mocha";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 60_000 });
  const testsRoot = __dirname;

  return new Promise((resolve, reject) => {
    glob("**/*.test.js", { cwd: testsRoot })
      .then((files) => {
        for (const f of files) mocha.addFile(path.resolve(testsRoot, f));
        try {
          mocha.run((failures) => {
            if (failures > 0) reject(new Error(`${failures} integration test(s) failed.`));
            else resolve();
          });
        } catch (err) {
          reject(err as Error);
        }
      })
      .catch((err) => reject(err as Error));
  });
}
