/**
 * First-run welcome overlay. Auto-plays exactly once per install (gated by
 * the host's `demoSeen` globalState, surfaced through the sessions
 * `settings` message → `maybeShowIntro`).
 *
 * Its job is discovery, not decoration: a new user lands on the Sessions
 * tab and — with no tour — never learns the other seven surfaces exist,
 * so word-of-mouth undersells the extension as "a session browser". This
 * names every surface up front. Dismissing it any way (button, Escape,
 * backdrop, or webview blur — all routed through Modal's onClose) marks it
 * seen so it never reappears.
 */
import { closeIntro, introVisible } from "../../shared/model";
import { useApi } from "../../shared/hooks";
import { Button, Icon, Modal } from "../../shared/ui";
import { TABS } from "../tabs/tabRegistry";

/**
 * One-line "what's here" per tab, keyed by tab id. Order and icons come
 * from the shared TABS registry so this stays in lockstep with the tab bar.
 */
const BLURBS: Record<string, string> = {
  sessions: "Search & resume every session",
  skills: "Global, project & plugin skills",
  mcp: "Toggle MCP servers, no JSON",
  agents: "Subagents with model badges",
  commands: "Built-in & custom slash commands",
  hooks: "Automation hooks, every scope",
  account: "Usage, quota & account switching",
  config: "Models, permissions & backups",
};

export function Intro() {
  const api = useApi();
  const close = (): void => {
    // Any dismissal counts as seen — persist so the intro never replays.
    api.post({ type: "markDemoSeen" });
    closeIntro();
  };
  return (
    <Modal open={introVisible.value} onClose={close}>
      <div class="intro">
        <div class="intro-header">
          <div class="intro-title">Welcome to Claude Code Manager</div>
          <div class="intro-sub">
            Your whole <code>~/.claude</code>, in one sidebar. Here's what's inside.
          </div>
        </div>
        <ul class="intro-grid">
          {TABS.map((t, i) => (
            <li class="intro-item" key={t.id} style={`--i:${i}`}>
              <span class="intro-item-icon">
                <Icon name={t.icon} size={18} />
              </span>
              <span class="intro-item-text">
                <span class="intro-item-label">{t.label}</span>
                <span class="intro-item-blurb">{BLURBS[t.id] ?? ""}</span>
              </span>
            </li>
          ))}
        </ul>
        <div class="intro-actions">
          <Button class="intro-cta" onClick={close}>
            Get started
          </Button>
        </div>
      </div>
    </Modal>
  );
}
