/**
 * Read the active VS Code theme polarity from the document body class list.
 * VS Code sets `vscode-dark`, `vscode-light`, or `vscode-high-contrast`.
 */
export function useTheme(): { isDark: boolean } {
  if (typeof document === "undefined") return { isDark: true };
  const cls = document.body.classList;
  const isDark = cls.contains("vscode-dark") || cls.contains("vscode-high-contrast");
  return { isDark };
}
