/**
 * Footer component -- renders the app footer with credit and social links.
 */

import { icon } from "../../../../webview/icons";
import { sendOpenUrl } from "../api";

/**
 * Render the footer HTML string.
 * @returns HTML for the app footer
 */
export function renderFooter(): string {
  return `
    <div class="app-footer">
      <span class="footer-name">Claude Manager</span>
      <span class="footer-links">
        <button class="footer-link" data-url="https://github.com/vishalguptax/claude-code-manager" title="GitHub">${icon("github")}</button>
        <button class="footer-link" data-url="https://www.linkedin.com/in/vishalgupta26/" title="LinkedIn">${icon("linkedin")}</button>
      </span>
    </div>`;
}

/**
 * Bind click event listeners to footer social links.
 */
export function bindFooter(): void {
  document.querySelectorAll(".footer-link[data-url]").forEach((el) => {
    el.addEventListener("click", () => {
      const url = (el as HTMLElement).dataset.url;
      if (url) sendOpenUrl(url);
    });
  });
}
