/**
 * Native QuickPick account switcher.
 *
 * Surfaced both from the webview (`openAccountSwitcher` message) and the
 * command palette (`claudeManager.switchAccount`). Extracted from the view
 * provider so the ~250-line QuickPick wiring doesn't bloat the coordinator.
 */
import * as vscode from "vscode";
import { postAccountData } from "./accountPush";
import { parseAccountData } from "../account/parser";
import { clearModelCache } from "../account/models";
import {
  updateProfile as updateProfileSnapshot,
  switchProfile as switchProfileSnapshot,
  removeProfile as removeProfileSnapshot,
} from "../account/profiles";
import type { SavedProfile } from "../account/profiles";
import { getWorkspace } from "../../extension/workspace";
import { createTerminal } from "../../extension/terminal";
import { buildSwitchConfirmDetail } from "./hostContext";
import type { WebviewMessage } from "./types";

/** Minimal context the switcher needs from the view provider. */
export interface AccountSwitcherContext {
  getWebview(): vscode.Webview | undefined;
  /** Re-entrant dispatch for the save-profile flow. */
  dispatch(msg: WebviewMessage): Promise<void>;
}

/**
 * Show the account switcher QuickPick. Lets the user switch to a saved
 * profile, save the current account, or log in as a new one — with
 * modal confirmation before any destructive credential overwrite.
 */
export async function openAccountSwitcher(ctx: AccountSwitcherContext): Promise<void> {
  const workspace = getWorkspace();
  const current = parseAccountData(workspace || undefined);
  // Overlay the active profile's displayed email with the live profile
  // email when it diverges — users who changed their email on claude.ai
  // after saving would otherwise see the snapshot's stale value.
  const savedProfiles = current.savedProfiles.map((p) => {
    if (
      p.slug === current.activeProfileSlug &&
      current.profile.email &&
      current.profile.email !== p.email
    ) {
      return { ...p, email: current.profile.email };
    }
    return p;
  });
  const activeSlug = current.activeProfileSlug;

  const UPDATE_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("sync"),
    tooltip: "Update snapshot with current credentials",
  };
  const REMOVE_BUTTON: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("trash"),
    tooltip: "Delete saved profile",
  };

  type Item = vscode.QuickPickItem & {
    action: "switch" | "save" | "login";
    slug?: string;
  };

  // Active profile first — users see "where am I" without scanning.
  const sortedProfiles = [...savedProfiles].sort((a, b) => {
    if (a.slug === activeSlug) return -1;
    if (b.slug === activeSlug) return 1;
    return 0;
  });

  const CHECK_ICON = new vscode.ThemeIcon("check");
  const ACCOUNT_ICON = new vscode.ThemeIcon("account");
  const SAVE_ICON = new vscode.ThemeIcon("save");
  const LOGIN_ICON = new vscode.ThemeIcon("log-in");

  // Pre-scan: identify duplicate profiles so we can mark any row that
  // isn't the freshest saved slot for its identity. Grouping key prefers
  // `accountUuid`; legacy snapshots fall back to userID + email.
  const identityGroups = new Map<string, SavedProfile[]>();
  for (const p of savedProfiles) {
    let key: string;
    if (p.accountUuid) {
      key = `uuid:${p.accountUuid}`;
    } else if (p.userID && p.email) {
      key = `${p.userID}|${p.email.toLowerCase()}`;
    } else {
      continue;
    }
    const bucket = identityGroups.get(key) ?? [];
    bucket.push(p);
    identityGroups.set(key, bucket);
  }
  const duplicateSlugs = new Set<string>();
  for (const group of identityGroups.values()) {
    if (group.length <= 1) continue;
    const ranked = [...group].sort((a, b) => {
      const at = Date.parse(a.savedAt || "") || 0;
      const bt = Date.parse(b.savedAt || "") || 0;
      return bt - at;
    });
    for (let i = 1; i < ranked.length; i++) duplicateSlugs.add(ranked[i].slug);
  }

  const items: Item[] = [];
  for (const p of sortedProfiles) {
    const isActive = p.slug === activeSlug;
    const isDuplicate = duplicateSlugs.has(p.slug);
    const metaParts: string[] = [];
    if (p.email) metaParts.push(p.email);
    if (p.subscriptionType) metaParts.push(p.subscriptionType);
    if (p.organizationName) metaParts.push(p.organizationName);
    if (isDuplicate) metaParts.push("duplicate — remove if unused");
    items.push({
      action: "switch",
      slug: p.slug,
      iconPath: isActive ? CHECK_ICON : ACCOUNT_ICON,
      label: p.label || p.email || p.slug,
      description: isActive ? "Active" : isDuplicate ? "Duplicate" : "",
      // Every row keeps a `detail` so native row heights match.
      detail: metaParts.join(" · ") || "Saved profile",
      buttons: isActive ? [UPDATE_BUTTON, REMOVE_BUTTON] : [REMOVE_BUTTON],
    });
  }

  if (sortedProfiles.length > 0) {
    items.push({
      action: "save",
      label: "",
      kind: vscode.QuickPickItemKind.Separator,
    } as Item);
  }

  if (current.profile.signedIn && !activeSlug) {
    items.push({
      action: "save",
      iconPath: SAVE_ICON,
      label: "Save current account as profile",
      detail: "Snapshot current credentials so you can switch back later",
    });
  }
  items.push({
    action: "login",
    iconPath: LOGIN_ICON,
    label: "Log in as a new account",
    detail: "Opens /login in a new Claude terminal",
  });

  const picker = vscode.window.createQuickPick<Item>();
  picker.title = "Switch Claude account";
  picker.placeholder = savedProfiles.length
    ? "Pick an account to switch to, or add a new one"
    : "No saved profiles yet — save the current account or log in a new one";
  picker.items = items;
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;

  const pushAccountUpdate = (): void => {
    const wv2 = ctx.getWebview();
    if (wv2) {
      // Drop the session-lifetime model scan so a CLI upgraded between
      // switches surfaces its new models; the scan re-runs cold on the
      // next parseAccountData.
      clearModelCache();
      postAccountData(wv2, parseAccountData(workspace || undefined));
    }
  };

  picker.onDidTriggerItemButton(async (e) => {
    const slug = (e.item as Item).slug;
    if (!slug) return;
    if (e.button === UPDATE_BUTTON) {
      picker.hide();
      const result = updateProfileSnapshot(slug);
      if (!result.ok) {
        vscode.window.showErrorMessage(
          `Couldn't update profile: ${result.detail ?? result.error}.`,
        );
      } else {
        vscode.window.showInformationMessage(`Profile "${result.data.label}" updated.`);
      }
      pushAccountUpdate();
    } else if (e.button === REMOVE_BUTTON) {
      picker.hide();
      const confirm = await vscode.window.showWarningMessage(
        "Delete saved profile?",
        {
          modal: true,
          detail:
            "The snapshot (including its OAuth token copy) will be permanently removed from ~/.claude/manager-accounts. The live Claude account isn't affected.",
        },
        "Delete",
      );
      if (confirm === "Delete") {
        removeProfileSnapshot(slug);
        pushAccountUpdate();
      }
    }
  });

  picker.onDidAccept(async () => {
    const pick = picker.selectedItems[0];
    picker.hide();
    picker.dispose();
    if (!pick) return;
    if (pick.action === "switch" && pick.slug) {
      if (pick.slug === activeSlug) return;
      const targetProfile = savedProfiles.find((p) => p.slug === pick.slug);
      const confirm = await vscode.window.showWarningMessage(
        "Switch Claude account?",
        { modal: true, detail: buildSwitchConfirmDetail(targetProfile) },
        "Switch",
      );
      if (confirm !== "Switch") return;
      const result = switchProfileSnapshot(pick.slug);
      if (!result.ok) {
        vscode.window.showErrorMessage(
          `Switch failed: ${result.detail ?? result.error}.`,
        );
      } else {
        vscode.window.showInformationMessage(
          `Switched to ${result.data.email || result.data.label}.`,
        );
      }
      pushAccountUpdate();
    } else if (pick.action === "save") {
      void ctx.dispatch({ type: "promptSaveProfile" } as WebviewMessage);
    } else if (pick.action === "login") {
      // Claude CLI's /login overwrites ~/.claude.json + credentials in
      // place. If the live account isn't backed by a saved profile,
      // firing /login immediately replaces it — force a save-first
      // prompt so users don't discover this the hard way.
      if (current.profile.signedIn && !activeSlug) {
        const choice = await vscode.window.showWarningMessage(
          "Save the current account first?",
          {
            modal: true,
            detail: `Logging in as a new account will overwrite ~/.claude.json and ~/.claude/.credentials.json in place — your current account (${current.profile.email || current.profile.displayName || "signed-in account"}) will be replaced, not added. Save it as a profile first so you can switch back later.`,
          },
          "Save and log in",
          "Log in anyway",
        );
        if (choice === undefined) return;
        if (choice === "Save and log in") {
          // Reuse the same input-box + disclaimer flow as the Account
          // tab's save button. Wait for the snapshot to land before
          // firing /login so the overwrite happens against a safely-
          // backed-up state.
          await ctx.dispatch({ type: "promptSaveProfile" } as WebviewMessage);
          // If the user aborted the label input or the disclaimer,
          // they're now looking at an unchanged home dir — still bail.
          const refreshed = parseAccountData(workspace || undefined);
          if (!refreshed.activeProfileSlug) return;
        }
        // choice === "Log in anyway" falls through to the login.
      }
      const term = createTerminal("login");
      term.show();
      term.sendText("claude");
      setTimeout(() => term.sendText("/login"), 1800);
    }
  });

  picker.onDidHide(() => picker.dispose());
  picker.show();
}
