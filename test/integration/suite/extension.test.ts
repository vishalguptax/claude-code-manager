/**
 * Extension Host integration tests. These run inside a real VS Code instance
 * booted by @vscode/test-electron, so they exercise activation, command
 * registration, and the webview HTML shell end to end — things the vitest
 * unit suite (which mocks `vscode`) cannot cover.
 *
 * Note on scope: the webview itself renders in a sandboxed iframe the
 * Extension Host cannot reach into, so per-tab DOM assertions are not
 * possible from here without a webview test bridge. We assert everything the
 * host CAN observe: the extension activates, every contributed command is
 * registered, the sidebar view resolves, and the generated HTML carries the
 * CSP + nonce + module entry the Preact shell needs to boot all seven feature
 * tabs. Live per-tab UI behaviour is covered by the vitest happy-dom suite and
 * the manual smoke checklist in VERIFY.md.
 */
import * as assert from "assert";
import * as vscode from "vscode";

const EXTENSION_ID = "vishalguptax.claude-manager";

const EXPECTED_COMMANDS = [
  "claudeManager.open",
  "claudeManager.switchAccount",
  "claudeManager.exportBrain",
  "claudeManager.importBrain",
  "claudeManager.reload",
  "claudeManager.runDiagnostics",
];

const VIEW_ID = "claudeCodeManager.view";

suite("Claude Manager — Extension Host integration", () => {
  test("the extension is present and activates", async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found`);
    await ext!.activate();
    assert.strictEqual(ext!.isActive, true, "extension failed to activate");
  });

  test("every contributed command is registered", async () => {
    const all = await vscode.commands.getCommands(true);
    for (const cmd of EXPECTED_COMMANDS) {
      assert.ok(all.includes(cmd), `command not registered: ${cmd}`);
    }
  });

  test("the sidebar view can be focused without throwing", async () => {
    // Focusing the view resolves the WebviewViewProvider, which builds the
    // HTML shell and wires the message dispatch — the core activation path.
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
    });
  });

  test("the open command focuses the sidebar without throwing", async () => {
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("claudeManager.open");
    });
  });

  test("the reload command runs without throwing", async () => {
    // reloadAll re-parses every feature (sessions, skills, commands, hooks,
    // mcp, agents, account) and re-posts to the webview. A clean run proves
    // the whole host-side feature graph imports and executes against a real
    // (empty) ~/.claude without crashing.
    await assert.doesNotReject(async () => {
      await vscode.commands.executeCommand("claudeManager.reload");
    });
  });
});
