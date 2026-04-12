/**
 * Extension entry point — registers the webview view provider, open command,
 * and status bar item.
 */
import * as vscode from "vscode";
import { ClaudeSessionViewProvider } from "../features/sessions/viewProvider";
import { setExtensionUri } from "./terminal";

/**
 * Activate the Claude Manager extension.
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

  // Status bar item — click to open the Claude Manager sidebar.
  // Note: VS Code status bar items only support built-in codicons ($(name)),
  // not custom SVG/PNG icons. We use "sparkle" as the closest brand-fit icon.
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(sparkle) Claude Manager";
  statusBarItem.tooltip = "Open Claude Manager sidebar";
  statusBarItem.command = "claudeManager.open";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

/**
 * Deactivate the extension. Currently a no-op.
 */
export function deactivate(): void {
  // No cleanup needed
}
