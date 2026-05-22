/**
 * Shared host-side context contract + small account helpers used by both
 * the message-dispatch modules (`messageHandlers`, `accountHandlers`) and
 * the view provider. Lives in its own file so those modules can depend on
 * the contract without importing each other.
 */
import type * as vscode from "vscode";
import type { SavedProfile } from "../account/profiles";
import type { WebviewMessage, Session } from "./types";
import type { Skill } from "../skills/types";
import type { Command } from "../commands/types";
import type { Hook } from "../hooks/types";
import type { McpServer } from "../mcp/types";
import type { Agent } from "../agents/types";

/**
 * globalState key for the cinematic intro "seen" flag. Stored in the
 * extension's globalState (not webview setState) so the intro is shown
 * exactly once per VS Code install and never replays unless the user
 * explicitly triple-clicks the footer brand text.
 */
export const DEMO_SEEN_KEY = "claudeManager.demoSeen";

/**
 * Build the modal body shown before a profile switch. The base
 * message always warns about running Claude terminals; when the
 * snapshot's access token is already past its `expiresAt`, we prepend
 * a stale-token notice so the user knows a `/login` may be required
 * after the swap (refresh tokens rotate on use, so a long-stale
 * snapshot may have no valid refresh path left).
 */
export function buildSwitchConfirmDetail(profile: SavedProfile | undefined): string {
  const base =
    "Your home-dir credentials will be overwritten with this saved profile. Close any running Claude terminals first — in-flight sessions may fail mid-task.";
  if (!profile || !profile.tokenExpiresAt) return base;
  const ageMs = Date.now() - profile.tokenExpiresAt;
  if (ageMs <= 0) return base;
  const days = Math.floor(ageMs / 86_400_000);
  const when =
    days >= 2 ? `${days} days ago` : days === 1 ? "yesterday" : "recently";
  return `⚠ The saved access token expired ${when}. Claude CLI will try to refresh in the background; if the refresh token has also rotated since you saved this profile, you'll need to /login after switching.\n\n${base}`;
}

/**
 * Account-distinct identity key. `accountUuid` is authoritative when
 * present; legacy snapshots without it fall back to lowercase email
 * (the next-best account-distinct field on `.claude.json`'s
 * `oauthAccount`). Empty string means "no identity" — used to detect
 * the signed-out → signed-in transition without firing a toast.
 *
 * The `email:` prefix on the fallback prevents an arbitrary uuid that
 * happens to equal someone's email (vanishingly unlikely but free
 * insurance) from colliding with a legacy slot.
 */
export function identityKey(accountUuid: string, email: string): string {
  if (accountUuid) return accountUuid;
  if (email) return `email:${email.toLowerCase()}`;
  return "";
}

/**
 * Extension-host state + callbacks the message handlers need.
 * Implemented by the view provider; passed in so dispatch never touches
 * a provider instance's private fields directly. The cache getters/
 * setters keep the provider's `this.sessions` etc. authoritative — the
 * provider's other lifecycle code reads the same arrays.
 */
export interface HostContext {
  readonly globalState?: vscode.Memento;
  getWebview(): vscode.Webview | undefined;

  getSessions(): Session[];
  setSessions(sessions: Session[]): void;
  getSkills(): Skill[];
  setSkills(skills: Skill[]): void;
  setCommands(commands: Command[]): void;
  setHooks(hooks: Hook[]): void;
  getMcpServers(): McpServer[];
  setMcpServers(servers: McpServer[]): void;
  setAgents(agents: Agent[]): void;

  postWorkspacePath(): void;
  refreshSettings(): void;
  buildSearchIndex(): void;
  reloadAll(): Promise<void>;
  openAccountSwitcher(): Promise<void>;
  /** Re-entrant dispatch for host-initiated messages (e.g. promptSaveProfile). */
  dispatch(msg: WebviewMessage): Promise<void>;
}
