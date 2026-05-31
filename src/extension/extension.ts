/**
 * Extension entry point — registers the webview view provider, open command,
 * and status bar item.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ClaudeSessionViewProvider } from "../features/sessions/viewProvider";
import { setSessionStorage } from "../features/sessions/commands";
import { setExtensionUri } from "./terminal";
import { setEphemeralStorage, sweepOrphans } from "./ephemeralSession";
import { getWorkspace } from "./workspace";
import { selfHealStatusline } from "../features/account/statuslineInstall";
import { ensureSessionStartHook } from "../features/sessions/sessionTapInstall";
import { startActiveSessionWatcher } from "../features/sessions/activeSessionWatcher";
import { exportBrain } from "../features/brain/exporter";
import { importBrain, previewConflicts, readManifest } from "../features/brain/importer";
import { runDiagnosticsCommand } from "../features/diagnostics/commands";

/**
 * Activate the Claude Manager extension.
 */
export function activate(context: vscode.ExtensionContext): void {
  setExtensionUri(context.extensionUri);
  // Wire persistent storage into the sessions commands module so the
  // export/import dialogs can remember the last folder the user chose.
  setSessionStorage(context.globalState);
  // Ephemeral (temp) session cleanup: wire storage, then drain any
  // pending entries left behind by a prior VS Code crash or reload.
  setEphemeralStorage(context.globalState);
  sweepOrphans();

  // Self-heal the statusline tap: if the user previously enabled live
  // quota but the project/local settings.json that holds our tap line
  // got reverted (a teammate's PR, a `git checkout`, a merge wipe), the
  // sidecar still says "installed" while Claude Code runs a stale (or
  // no) statusline → the Quota card freezes. Re-install silently so the
  // user never has to click Enable twice. No-op when sidecar is absent
  // or the tap is already wired. Failures must not block activation.
  try {
    selfHealStatusline(
      path.join(__dirname, "statusline-tap.js"),
      getWorkspace() || undefined,
    );
  } catch (err) {
    console.warn("[claude-manager] statusline self-heal failed:", err);
  }

  // SessionStart hook tap: install (idempotent) so Claude CLI writes
  // `{sessionId, ppid, cwd}` into our active-sessions registry on every
  // boot — bare `claude`, `--continue`, `--resume`, external launches
  // all included. The watcher matches PPID → vscode.Terminal.processId
  // so the row + detail action swap from Resume to View for the
  // terminal hosting that session, regardless of how it was started.
  // Failures must not block activation.
  try {
    ensureSessionStartHook(path.join(__dirname));
  } catch (err) {
    console.warn("[claude-manager] session-start hook install failed:", err);
  }

  const provider = new ClaudeSessionViewProvider(
    context.extensionUri,
    context.globalState,
  );

  context.subscriptions.push(startActiveSessionWatcher(provider.terminals));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "claudeCodeManager.view",
      provider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.open", () => {
      vscode.commands.executeCommand("claudeCodeManager.view.focus");
    }),
  );

  // Command Palette entry for "Claude Manager: Switch Account". Opens
  // the sidebar first so the webview exists to receive the message,
  // then fires the native QuickPick switcher. Works whether or not
  // the panel was visible beforehand.
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.switchAccount", async () => {
      await vscode.commands.executeCommand("claudeCodeManager.view.focus");
      provider.openAccountSwitcher();
    }),
  );

  // Force a full re-parse of every tab without recreating the webview.
  // Surfaces in the command palette and through the toolbar button;
  // both routes funnel into the provider's `reloadAll`. Focuses the
  // sidebar first so a freshly-opened panel still receives the data
  // push (no-op when the view is already visible).
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.reload", async () => {
      await vscode.commands.executeCommand("claudeCodeManager.view.focus");
      await provider.reloadAll();
    }),
  );

  // Self-diagnostic — runs a battery of pre-flight checks and opens
  // the result in a markdown editor tab so the user can read, copy,
  // or paste it into a bug report. No webview surface needed; the
  // editor is the obvious medium for a one-shot text report.
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.runDiagnostics", () => runDiagnosticsCommand()),
  );

  // Re-push settings to the open webview whenever the user changes a
  // claudeManager.* setting. Without this they have to close and reopen the
  // panel for new defaults to take effect.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("claudeManager")) {
        provider.refreshSettings();
      }
    }),
  );

  // Brain Export / Import — the "take my Claude setup somewhere else"
  // commands. Packaged as Command Palette entries rather than inline
  // UI because the action is rare and per-machine, not per-task.
  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.exportBrain", async () => {
      try {
        const workspace = getWorkspace();
        const scopeOptions: Array<{
          label: string;
          description: string;
          value: "global" | "project" | "both";
        }> = [
          {
            label: "Global only",
            description: "~/.claude/ — skills, commands, agents, memory, settings",
            value: "global",
          },
          ...(workspace
            ? [
                {
                  label: "Project only",
                  description: "Current workspace — .claude/ + CLAUDE.md + .mcp.json",
                  value: "project" as const,
                },
                {
                  label: "Both",
                  description: "Global + current workspace",
                  value: "both" as const,
                },
              ]
            : []),
        ];
        const pick = await vscode.window.showQuickPick(scopeOptions, {
          title: "Export Brain — which scope?",
          placeHolder: "Pick the scope to archive",
        });
        if (!pick) return;

        const defaultName =
          pick.value === "global"
            ? `claude-brain-${new Date().toISOString().slice(0, 10)}.claudebrain.zip`
            : workspace
            ? `${path.basename(workspace)}.claudebrain.zip`
            : `claude-brain.claudebrain.zip`;
        const defaultDir = workspace || os.homedir();

        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(defaultDir, defaultName)),
          filters: { "Claude Brain archive (*.zip)": ["zip"] },
          saveLabel: "Export Brain",
        });
        if (!target) return;

        const buf = exportBrain(pick.value, workspace || undefined);
        fs.writeFileSync(target.fsPath, buf);
        const size = (buf.length / 1024).toFixed(1);
        vscode.window.showInformationMessage(
          `Brain exported to ${path.basename(target.fsPath)} (${size} KB).`,
        );
      } catch (err) {
        // Surface any silent failure — without this wrapping, a bad
        // import path, a missing home dir, or a Uri parse error
        // looked like "nothing happened" from the user's side.
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[claude-manager] exportBrain failed:", err);
        vscode.window.showErrorMessage(`Export failed: ${msg}.`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeManager.importBrain", async () => {
     try {
      const workspace = getWorkspace();
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { "Claude Brain archive (*.zip)": ["zip"] },
        openLabel: "Import Brain",
        title: "Import Brain — pick a .claudebrain.zip",
      });
      if (!picked || picked.length === 0) return;

      let buf: Buffer;
      try {
        buf = fs.readFileSync(picked[0].fsPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Couldn't read archive: ${msg}.`);
        return;
      }
      const manifest = readManifest(buf);
      if (!manifest) {
        vscode.window.showErrorMessage(
          "Not a valid Claude Brain archive (no manifest found).",
        );
        return;
      }

      // Offer the sections the archive actually contains, filtered by
      // whether a workspace is open. Pre-select everything.
      const sectionPicks: Array<{ label: string; section: "global" | "project"; picked: boolean }> = [];
      if (manifest.sections.includes("global")) {
        sectionPicks.push({ label: "Global (~/.claude/)", section: "global", picked: true });
      }
      if (manifest.sections.includes("project")) {
        if (workspace) {
          sectionPicks.push({
            label: `Project (current workspace: ${path.basename(workspace)})`,
            section: "project",
            picked: true,
          });
        } else {
          vscode.window.showWarningMessage(
            "Archive contains a Project section but no workspace is open. Only Global will be importable.",
          );
        }
      }
      if (sectionPicks.length === 0) {
        vscode.window.showErrorMessage("Archive has no importable sections.");
        return;
      }

      const chosen = await vscode.window.showQuickPick(
        sectionPicks.map((p) => ({
          label: p.label,
          picked: p.picked,
          description: "",
          sectionValue: p.section,
        })),
        {
          canPickMany: true,
          title: "Import Brain — which sections?",
        },
      );
      if (!chosen || chosen.length === 0) return;

      const chosenSections = chosen.map((c) =>
        (c as typeof chosen[number] & { sectionValue: "global" | "project" }).sectionValue,
      );

      const preview = previewConflicts(buf, workspace || undefined, chosenSections);
      const totalReplacements = preview.overwrites.length + preview.mcpReplacements.length;
      const detail = (() => {
        if (totalReplacements === 0) {
          return "No existing files conflict. New files will be written into place. `mcpServers` entries merge into ~/.claude.json.";
        }
        const samplePaths = preview.overwrites.slice(0, 5);
        const moreFiles = preview.overwrites.length > samplePaths.length
          ? `\n…and ${preview.overwrites.length - samplePaths.length} more`
          : "";
        const filesBlock = preview.overwrites.length
          ? `Files to overwrite (${preview.overwrites.length}):\n${samplePaths.join("\n")}${moreFiles}`
          : "";
        const sampleMcp = preview.mcpReplacements.slice(0, 5);
        const moreMcp = preview.mcpReplacements.length > sampleMcp.length
          ? `\n…and ${preview.mcpReplacements.length - sampleMcp.length} more`
          : "";
        const mcpBlock = preview.mcpReplacements.length
          ? `mcpServers entries to replace (${preview.mcpReplacements.length}):\n${sampleMcp.join("\n")}${moreMcp}`
          : "";
        return [filesBlock, mcpBlock].filter(Boolean).join("\n\n");
      })();

      const confirmLabel = totalReplacements === 0 ? "Import" : "Replace & Import";
      const confirm = await vscode.window.showWarningMessage(
        totalReplacements === 0
          ? "Import this Brain archive?"
          : `Replace ${totalReplacements} existing item${totalReplacements === 1 ? "" : "s"}?`,
        { modal: true, detail },
        confirmLabel,
      );
      if (confirm !== confirmLabel) return;

      try {
        const summary = importBrain(buf, workspace || undefined, chosenSections);
        const parts: string[] = [];
        if (summary.written.length) parts.push(`${summary.written.length} written`);
        if (summary.overwritten.length) parts.push(`${summary.overwritten.length} replaced`);
        if (summary.mergedMcpServers.length) parts.push(`${summary.mergedMcpServers.length} MCP merged`);
        if (summary.skipped.length) parts.push(`${summary.skipped.length} skipped`);
        const body = parts.length > 0 ? parts.join(" · ") : "Nothing to import";
        vscode.window.showInformationMessage(`Brain import complete — ${body}.`);
        // Surface hook-path warnings separately so users can act on
        // them without re-reading the summary toast. Only shown when
        // the hook inspection actually flagged something.
        if (summary.warnings.length > 0) {
          const lines = summary.warnings.slice(0, 5);
          const extra =
            summary.warnings.length > 5
              ? `\n(+${summary.warnings.length - 5} more)`
              : "";
          vscode.window.showWarningMessage(
            "Imported settings reference paths that don't exist on this machine.",
            {
              modal: true,
              detail: lines.join("\n") + extra,
            },
            "OK",
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Import failed: ${msg}.`);
      }
     } catch (err) {
       // Outer guard for any failure BEFORE the importBrain try — a
       // corrupt zip, a cancelled dialog interaction that still
       // throws, etc. Without this the command looked silent on
       // error paths we hadn't anticipated.
       const msg = err instanceof Error ? err.message : String(err);
       console.error("[claude-manager] importBrain failed:", err);
       vscode.window.showErrorMessage(`Import failed: ${msg}.`);
     }
    }),
  );

  // Status bar item — click to open the Claude Manager sidebar.
  // Note: VS Code status bar items only support built-in codicons ($(name)),
  // not custom SVG/PNG icons. We use "sparkle" as the closest brand-fit icon.
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(sparkle) Claude Manager";
  statusBarItem.tooltip = "Open Claude Manager sidebar";
  statusBarItem.command = "claudeManager.open";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

/**
 * Deactivate the extension. Currently a no-op.
 */
export function deactivate(): void {
  // No cleanup needed
}
