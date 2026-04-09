/**
 * Extension entry point — registers the webview view provider and the open command.
 */
import * as vscode from "vscode";
import { ClaudeSessionViewProvider } from "../features/sessions/viewProvider";
import { setExtensionUri } from "./terminal";

/**
 * Activate the Claude Code Manager extension.
 * Registers the webview view provider and the open command.
 */
export function activate(context: vscode.ExtensionContext): void {
  setExtensionUri(context.extensionUri);
  const provider = new ClaudeSessionViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "claudeCodeManager.view",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.open", () => {
      vscode.commands.executeCommand("claudeCodeManager.view.focus");
    }),
  );
}

/**
 * Deactivate the extension. Currently a no-op.
 */
export function deactivate(): void {
  // No cleanup needed
}
