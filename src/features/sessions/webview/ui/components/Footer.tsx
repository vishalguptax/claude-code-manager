/**
 * App footer — product name plus GitHub / LinkedIn links. Restores the v1
 * `footer.ts` footer. Links open externally via the host `openUrl` message
 * (sendOpenUrl) rather than a raw anchor, so the webview CSP's `connect-src
 * 'none'` is never involved and navigation stays under host control.
 *
 * The two links are shared icon-variant <Button>s; the `.footer-link` class is
 * kept so the footer's bespoke sizing/colour (sessions-unique) still applies.
 */
import { Button } from "../../../../../webview/shared/ui";
import { sendOpenUrl } from "../../api";

const GITHUB_URL = "https://github.com/vishalguptax/claude-code-manager";
const LINKEDIN_URL = "https://www.linkedin.com/in/vishalgupta26/";

export function Footer() {
  return (
    <div class="app-footer">
      <span class="footer-name">Claude Code Manager</span>
      <span class="footer-links">
        <Button
          variant="icon"
          class="footer-link"
          iconName="github"
          title="GitHub"
          ariaLabel="Open the project on GitHub"
          onClick={() => sendOpenUrl(GITHUB_URL)}
        />
        <Button
          variant="icon"
          class="footer-link"
          iconName="linkedin"
          title="LinkedIn"
          ariaLabel="Open the author's LinkedIn"
          onClick={() => sendOpenUrl(LINKEDIN_URL)}
        />
      </span>
    </div>
  );
}
