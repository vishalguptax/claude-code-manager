/**
 * App footer — product name plus GitHub / LinkedIn links. Shell-level chrome
 * (not feature content): rendered once by App.tsx below the tab content, so it
 * is visible on every tab consistently, instead of only on the Sessions list
 * (where it lived before — an artifact of Sessions being the first feature
 * built, not a deliberate "only sessions gets a footer" decision).
 *
 * Links open externally via the host `openUrl` message (rather than a raw
 * anchor) so the webview CSP's `connect-src 'none'` is never involved and
 * navigation stays under host control. Posted directly through the shared
 * `useApi()` bridge — shell code must not import a feature's api.ts.
 */
import type { WebviewMessage } from "../../../shared/protocol/messages";
import { useApi } from "../../shared/hooks";
import { Button } from "../../shared/ui";

const GITHUB_URL = "https://github.com/vishalguptax/claude-code-manager";
const LINKEDIN_URL = "https://www.linkedin.com/in/vishalgupta26/";

export function Footer() {
  const { post } = useApi();
  const openUrl = (url: string): void => post({ type: "openUrl", url } satisfies WebviewMessage);

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
          onClick={() => openUrl(GITHUB_URL)}
        />
        <Button
          variant="icon"
          class="footer-link"
          iconName="linkedin"
          title="LinkedIn"
          ariaLabel="Open the author's LinkedIn"
          onClick={() => openUrl(LINKEDIN_URL)}
        />
      </span>
    </div>
  );
}
