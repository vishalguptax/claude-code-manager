/**
 * Webview HTML generation — requires VS Code API.
 */
import * as vscode from "vscode";
import { getNonce } from "../core/utils";

/**
 * Generate the full HTML document for the webview panel.
 * Includes CSP headers, VS Code theme CSS variables, and script/style resource URIs.
 */
export function getWebviewHtml(webview: vscode.Webview, extUri: vscode.Uri): string {
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, "dist", "webview", "main.js"));
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extUri, "dist", "webview", "styles.css"));
  const nonce = getNonce();

  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} https: data:`,
    "connect-src 'none'",
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${cssUri}">
  <style>
    :root {
      --bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --bg-hover: var(--vscode-list-hoverBackground, rgba(255,255,255,0.06));
      --bg-active: var(--vscode-list-activeSelectionBackground);
      --bg-active-fg: var(--vscode-list-activeSelectionForeground);
      --fg: var(--vscode-sideBar-foreground, var(--vscode-editor-foreground));
      --fg-dim: var(--vscode-descriptionForeground);
      --fg-muted: var(--vscode-disabledForeground);
      --border: var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border));
      --accent: var(--vscode-focusBorder);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --badge-neutral-bg: rgba(128, 128, 128, 0.18);
      --badge-neutral-fg: var(--fg);
      --input-bg: var(--vscode-input-background);
      --input-border: var(--vscode-input-border, transparent);
      --input-fg: var(--vscode-input-foreground);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --btn-sec-bg: var(--vscode-button-secondaryBackground, var(--vscode-list-hoverBackground, rgba(255,255,255,0.08)));
      --btn-sec-fg: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.12));
      --link: var(--vscode-textLink-foreground);
      --green: #2ea043;
      --green-bg: rgba(46,160,67,0.15);
      --orange: var(--vscode-notificationsWarningIcon-foreground, #f5a623);
      --orange-bg: rgba(245,166,35,0.15);
      --red: var(--vscode-errorForeground, #f85149);
      --red-bg: rgba(248,81,73,0.15);
      --mono: var(--vscode-editor-font-family, monospace);
      --shadow: rgba(0,0,0,0.25);
      --dropdown-bg: var(--vscode-dropdown-background, var(--input-bg));
      --dropdown-border: var(--vscode-dropdown-border, var(--border));
      --menu-bg: var(--vscode-menu-background, var(--input-bg));
      --menu-border: var(--vscode-menu-border, var(--border));
      --menu-fg: var(--vscode-menu-foreground, var(--fg));
      --color-blue: #58a6ff;
      --color-blue-bg: rgba(88,166,255,0.15);
      --color-purple: #a371f7;
      --color-purple-bg: rgba(163,113,247,0.15);
      --color-green-badge: #3fb950;
      --color-green-badge-bg: rgba(63,185,80,0.15);
      --fs-xs: 10px;
      --fs-sm: 11px;
      --fs-base: 12px;
      --fs-md: 13px;
      --fs-lg: 14px;
      --fs-xl: 16px;
      --radius-sm: 3px;
      --radius: 4px;
      --radius-md: 5px;
      --radius-lg: 6px;
      --space-xs: 4px;
      --space-sm: 6px;
      --space-md: 8px;
      --space-lg: 10px;
      --space-xl: 12px;
      --space-2xl: 14px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      overflow: hidden;
      /* Let native controls (inputs, scrollbars, autofill) render for the
         ambient theme instead of always assuming light. */
      color-scheme: light dark;
    }
    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background);
      border-radius: 3px;
    }
    #root { height: 100vh; display: flex; flex-direction: column; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
