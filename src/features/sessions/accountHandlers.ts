/**
 * Webview → host message handlers for the Account tab: live account data,
 * quota, saving a profile (prompt + snapshot), opening the account switcher,
 * and settings snapshot restore/delete. Switch/Update/Remove of saved
 * profiles run inside the QuickPick switcher (accountSwitcher.ts), not here.
 * Returns `true` when the message was handled, `false` to let the caller try
 * the next handler.
 */
import * as vscode from "vscode";
import { postAccountData } from "./accountPush";
import * as path from "path";
import {
  parseAccountData,
  restoreSettingsSnapshot as restoreSettingsSnapshotFile,
  deleteSettingsSnapshot as deleteSettingsSnapshotFile,
} from "../account/parser";
import { readQuota } from "../account/quota";
import { revalidateModelCache } from "../account/models";
import { installStatusline, uninstallStatusline } from "../account/statuslineInstall";
import {
  saveProfile as saveProfileSnapshot,
  updateProfile as updateProfileSnapshot,
  listProfiles as listProfilesSnapshot,
} from "../account/profiles";
import { getWorkspace } from "../../extension/workspace";
import type { WebviewMessage } from "./types";
import type { HostContext } from "./hostContext";

export async function handleAccountMessage(
  msg: WebviewMessage,
  ctx: HostContext,
): Promise<boolean> {
  const wv = ctx.getWebview();
  if (!wv) return true;

  switch (msg.type) {
    case "getAccountData": {
      const workspace = getWorkspace();
      const data = parseAccountData(workspace || undefined);
      postAccountData(wv, data);
      // A CLI upgrade rewrites the binary in place but touches no account
      // file, so the model list can go stale while idle — revalidation
      // otherwise only runs on the transcript-write tick, which never fires
      // for a user who isn't mid-session. Re-check on panel open and re-push
      // only if the scan actually changed. Cheap: an mtime/size stat unless
      // the binary moved.
      void revalidateModelCache().then((changed) => {
        const live = ctx.getWebview();
        if (changed && live) {
          postAccountData(live, parseAccountData(getWorkspace() || undefined));
        }
      });
      break;
    }

    case "fetchQuota": {
      // No network call: re-read the local statusline cache the tap
      // wrote. Workspace is threaded so the installed-check considers
      // project / local statusLine scopes (precedence: local › project
      // › global).
      const workspace = getWorkspace() || undefined;
      wv.postMessage({ type: "quotaData", result: readQuota(workspace) });
      break;
    }

    case "installStatusline": {
      // Opt-in: wire Claude Code's statusLine.command to our tap so it
      // caches the server-computed quota locally. Installs at the
      // GLOBAL scope (machine-wide), with a local-scope override in
      // workspaces whose project/local statusline shadows it — the
      // shared project settings file is never written. The bundled tap
      // script sits beside extension.js in dist/; __dirname resolves
      // there.
      const tapSource = path.join(__dirname, "statusline-tap.js");
      const workspace = getWorkspace() || undefined;
      const res = installStatusline(tapSource, workspace);
      if (!res.ok) {
        vscode.window.showErrorMessage(
          res.error === "managed-by-org"
            ? "Can't enable live quota: your organization's managed settings define the statusline."
            : `Couldn't enable live quota: ${res.error}.`,
        );
      }
      wv.postMessage({ type: "quotaData", result: readQuota(workspace) });
      postAccountData(wv, parseAccountData(workspace));
      break;
    }

    case "uninstallStatusline": {
      const workspace = getWorkspace() || undefined;
      const res = uninstallStatusline(workspace);
      if (!res.ok) {
        vscode.window.showErrorMessage(`Couldn't disable live quota: ${res.error}.`);
      }
      wv.postMessage({ type: "quotaData", result: readQuota(workspace) });
      postAccountData(wv, parseAccountData(workspace));
      break;
    }

    case "promptSaveProfile": {
      // Native VS Code input box replaces the old inline save form.
      // Default label sourced from the live account so most users
      // can just press Enter. We pre-parse account data once to seed
      // the default; re-parse after save so the reply reflects the
      // new profile list.
      const workspace = getWorkspace();
      const current = parseAccountData(workspace || undefined);
      const p = current.profile;

      // One-time security disclaimer: saving copies the OAuth
      // token into ~/.claude/manager-accounts/. We surface that
      // exactly once via globalState so users give informed
      // consent on first save, then never see it again. Refusing
      // the prompt aborts the save entirely.
      const DISCLAIMER_KEY = "claudeManager.accounts.disclaimerAck";
      const seen = ctx.globalState?.get<boolean>(DISCLAIMER_KEY) ?? false;
      if (!seen) {
        const choice = await vscode.window.showWarningMessage(
          "Save Claude account as a profile?",
          {
            modal: true,
            detail:
              "Claude Code Manager will copy your OAuth tokens from ~/.claude.json and ~/.claude/.credentials.json into ~/.claude/manager-accounts/ so you can switch back to this account later. Tokens are stored in plain text — same format Claude CLI uses. Treat that folder as sensitive. This notice is shown once.",
          },
          "Understood, save",
        );
        if (choice !== "Understood, save") break;
        await ctx.globalState?.update(DISCLAIMER_KEY, true);
      }

      const defaultLabel =
        p.organizationName ||
        p.displayName ||
        (p.email ? p.email.split("@")[0] : "Profile");
      const label = await vscode.window.showInputBox({
        title: "Save account as profile",
        prompt: "Label for this Claude account snapshot",
        value: defaultLabel,
        validateInput: (v: string) =>
          v.trim().length > 0 ? null : "Label cannot be empty",
      });
      if (label === undefined) break;
      const result = saveProfileSnapshot(label);
      if (!result.ok) {
        if (result.error === "already-saved" && result.detail) {
          // A slot already exists for this identity — happens when Claude
          // CLI's token rotation desynced the active-profile hash match and
          // the UI re-surfaced "Save profile". Offer to Update the existing
          // slot so tokens get re-captured, which is almost always intended.
          const existingSlug = result.detail;
          const existing = listProfilesSnapshot().find((pp) => pp.slug === existingSlug);
          const existingLabel = existing?.label ?? existingSlug;
          const choice = await vscode.window.showInformationMessage(
            `A profile already exists for this account (${existingLabel}).`,
            {
              modal: true,
              detail:
                "Refresh its saved tokens with the current login so it picks up Claude CLI's latest rotated token.",
            },
            "Update existing",
          );
          if (choice === "Update existing") {
            const upd = updateProfileSnapshot(existingSlug);
            if (!upd.ok) {
              vscode.window.showErrorMessage(
                `Couldn't update profile: ${upd.detail ?? upd.error}.`,
              );
            } else {
              vscode.window.showInformationMessage(
                `Profile "${upd.data.label}" refreshed.`,
              );
            }
          }
        } else {
          vscode.window.showErrorMessage(
            `Couldn't save profile: ${result.detail ?? result.error}.`,
          );
        }
      }
      postAccountData(wv, parseAccountData(workspace || undefined));
      break;
    }

    case "openAccountSwitcher":
      await ctx.openAccountSwitcher();
      break;

    case "restoreSettingsSnapshot": {
      const workspace = getWorkspace();
      const choice = await vscode.window.showWarningMessage(
        `Restore ${msg.scope} settings from this snapshot?`,
        {
          modal: true,
          detail:
            "Your current settings.json will be overwritten. The current file is itself snapshotted first, so this restore is reversible from the same list.",
        },
        "Restore",
      );
      if (choice !== "Restore") break;
      const ok = restoreSettingsSnapshotFile(
        msg.scope,
        msg.snapshotId,
        workspace || undefined,
      );
      if (!ok) {
        vscode.window.showErrorMessage(
          `Couldn't restore ${msg.scope} snapshot — file may be missing.`,
        );
      }
      postAccountData(wv, parseAccountData(workspace || undefined));
      break;
    }

    case "deleteSettingsSnapshot": {
      const workspace = getWorkspace();
      const ok = deleteSettingsSnapshotFile(msg.scope, msg.snapshotId);
      if (!ok) {
        vscode.window.showWarningMessage(
          `Couldn't delete snapshot — already gone.`,
        );
      }
      postAccountData(wv, parseAccountData(workspace || undefined));
      break;
    }

    default:
      return false;
  }
  return true;
}
