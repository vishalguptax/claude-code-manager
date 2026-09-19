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
      --fg-muted: color-mix(in srgb, var(--vscode-foreground, var(--fg)) 30%, var(--vscode-descriptionForeground, var(--fg)));
      --fg-disabled: var(--vscode-disabledForeground);
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
      --green: #3fb950;
      --green-bg: color-mix(in srgb, var(--green) 15%, transparent);
      --orange: var(--vscode-notificationsWarningIcon-foreground, #f5a623);
      --orange-bg: color-mix(in srgb, var(--orange) 15%, transparent);
      --red: var(--vscode-errorForeground, #f85149);
      --red-bg: color-mix(in srgb, var(--red) 15%, transparent);
      --mono: var(--vscode-editor-font-family, monospace);
      --shadow: rgba(0,0,0,0.25);
      --dropdown-bg: var(--vscode-dropdown-background, var(--input-bg));
      --dropdown-border: var(--vscode-dropdown-border, var(--border));
      --menu-bg: var(--vscode-menu-background, var(--input-bg));
      --menu-border: var(--vscode-menu-border, var(--border));
      --menu-fg: var(--vscode-menu-foreground, var(--fg));
      --color-blue: #58a6ff;
      --color-blue-bg: color-mix(in srgb, var(--color-blue) 15%, transparent);
      --color-purple: #a371f7;
      --color-purple-bg: color-mix(in srgb, var(--color-purple) 15%, transparent);
      --color-green-badge: var(--green);
      --color-green-badge-bg: var(--green-bg);
      --color-amber: #ff9966;
      --color-amber-bg: color-mix(in srgb, var(--color-amber) 15%, transparent);
      --fs-root: var(--vscode-font-size, 13px);
      --fs-xs: calc(var(--fs-root) * 0.77);
      --fs-sm: calc(var(--fs-root) * 0.85);
      --fs-base: calc(var(--fs-root) * 0.92);
      --fs-md: var(--fs-root);
      --fs-lg: calc(var(--fs-root) * 1.15);
      --fs-xl: calc(var(--fs-root) * 1.38);
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
    /* Light-surface half of the semantic palette — see the long note at the
       foot of src/styles/tokens.css. VS Code stamps these classes on <body>,
       and body (0,1,1) outranks :root (0,1,0). */
    body.vscode-light,
    body.vscode-high-contrast-light {
      --green: #1a7f37;
      --color-blue: #0969da;
      --color-purple: #8250df;
      --color-amber: #bc4c00;
      --orange: var(--vscode-notificationsWarningIcon-foreground, #9a6700);
      --red: var(--vscode-errorForeground, #cf222e);
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
