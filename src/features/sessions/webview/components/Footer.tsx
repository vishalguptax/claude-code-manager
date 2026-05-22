/**
 * App footer — product name plus GitHub / LinkedIn links. Restores the v1
 * `footer.ts` footer. Links open externally via the host `openUrl` message
 * (sendOpenUrl) rather than a raw anchor, so the webview CSP's `connect-src
 * 'none'` is never involved and navigation stays under host control.
 */
import { Icon } from "../../../../webview/shared/ui";
import { sendOpenUrl } from "../api";

const GITHUB_URL = "https://github.com/vishalguptax/claude-code-manager";
const LINKEDIN_URL = "https://www.linkedin.com/in/vishalgupta26/";

export function Footer() {
  return (
    <div class="app-footer">
      <span class="footer-name">Claude Manager</span>
      <span class="footer-links">
        <button
          type="button"
          class="footer-link"
          title="GitHub"
          aria-label="Open the project on GitHub"
          onClick={() => sendOpenUrl(GITHUB_URL)}
        >
          <Icon name="github" size={14} />
        </button>
        <button
          type="button"
          class="footer-link"
          title="LinkedIn"
          aria-label="Open the author's LinkedIn"
          onClick={() => sendOpenUrl(LINKEDIN_URL)}
        >
          <Icon name="linkedin" size={14} />
        </button>
      </span>
    </div>
  );
}
