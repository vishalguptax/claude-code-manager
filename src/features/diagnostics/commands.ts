/**
 * Command-palette glue for the self-diagnostic. Runs the pure-fs
 * checks in `runner.ts`, layers in vscode-aware checks (workspace,
 * VS Code version), formats a markdown report, and opens it in an
 * editor tab so the user can read + copy + paste into a bug report.
 */
import * as vscode from "vscode";
import { formatErrors, getOutputChannel } from "./errorLog";
import { buildIssueUrl, buildReport, DEFAULT_ISSUE_TITLE } from "./report";
import { runDiagnostics } from "./runner";
import type { DiagnosticCheck } from "./types";

const STATUS_ICON: Record<DiagnosticCheck["status"], string> = {
  pass: "[ OK ]",
  warn: "[WARN]",
  fail: "[FAIL]",
};

/**
 * Resolve the minimum VS Code version declared in package.json. Kept
 * as a constant rather than importing package.json so the file isn't
 * bundled into the webview by accident.
 */
const MIN_VSCODE = "1.85.0";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function checkVsCodeVersion(): DiagnosticCheck {
  const current = vscode.version;
  if (compareSemver(current, MIN_VSCODE) >= 0) {
    return {
      id: "vscode",
      label: "VS Code version",
      status: "pass",
      detail: `${current} ≥ ${MIN_VSCODE}`,
    };
  }
  return {
    id: "vscode",
    label: "VS Code version",
    status: "fail",
    detail: `${current} < ${MIN_VSCODE}`,
    fixHint: "Upgrade VS Code — older builds lack the webview APIs Claude Code Manager uses.",
  };
}

function checkWorkspace(): DiagnosticCheck {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    return {
      id: "workspace",
      label: "Workspace open",
      status: "warn",
      detail: "No folder open. Project-scoped features (this branch / project filter / project settings) won't work.",
    };
  }
  return {
    id: "workspace",
    label: "Workspace open",
    status: "pass",
    detail: folders.map((f) => f.name).join(", "),
  };
}

/** Render the report as markdown for `openTextDocument`. */
function formatReport(checks: DiagnosticCheck[]): string {
  const stamp = new Date().toISOString();
  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };

  const lines: string[] = [];
  lines.push("# Claude Code Manager — Diagnostic report");
  lines.push("");
  lines.push(`Generated: ${stamp}`);
  lines.push(
    `Result: ${summary.pass} pass · ${summary.warn} warn · ${summary.fail} fail`,
  );
  lines.push("");
  lines.push("| Status | Check | Detail |");
  lines.push("|--------|-------|--------|");
  for (const c of checks) {
    const detail = c.detail.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${STATUS_ICON[c.status]} | ${c.label} | ${detail} |`);
  }
  const withHints = checks.filter((c) => c.fixHint);
  if (withHints.length > 0) {
    lines.push("");
    lines.push("## Fix hints");
    lines.push("");
    for (const c of withHints) {
      lines.push(`- **${c.label}** — ${c.fixHint}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Build the full check list (pure + vscode-aware). Exported for tests. */
export async function runAllChecks(): Promise<DiagnosticCheck[]> {
  return [...(await runDiagnostics()), checkVsCodeVersion(), checkWorkspace()];
}

/**
 * Top-level command handler. Surfaced in package.json as
 * `claudeManager.runDiagnostics`.
 */
export async function runDiagnosticsCommand(): Promise<void> {
  const checks = await runAllChecks();
  const report = formatReport(checks);
  const doc = await vscode.workspace.openTextDocument({
    content: report,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

/** Plain-text rendering of the checks, for the bug report's code block. */
function formatChecksPlain(checks: DiagnosticCheck[]): string {
  return checks.map((c) => `${STATUS_ICON[c.status]} ${c.label}: ${c.detail}`).join("\n");
}

/** The repository the issue is filed against — matches package.json. */
const REPO_URL = "https://github.com/vishalguptax/claude-code-manager";

/**
 * "Report a problem": assemble the environment, the session's error log and
 * the diagnostic checks into one markdown report, then let the user choose
 * what to do with it. Nothing leaves the machine unless the user picks the
 * GitHub option, which opens their browser on a prefilled issue form — the
 * extension itself still makes no network calls.
 */
export async function reportIssueCommand(): Promise<void> {
  const extension = vscode.extensions.getExtension("vishalguptax.claude-manager");
  const checks = await runAllChecks();
  const report = buildReport({
    env: {
      extensionVersion: (extension?.packageJSON as { version?: string } | undefined)?.version ?? "unknown",
      vscodeVersion: vscode.version,
      platform: process.platform,
      osRelease: process.versions.electron ? `electron ${process.versions.electron}` : undefined,
    },
    errors: formatErrors(),
    checks: formatChecksPlain(checks),
  });

  const COPY = "Copy report";
  const ISSUE = "Open GitHub issue";
  const DOCUMENT = "Open as document";
  const LOG = "Show error log";
  const choice = await vscode.window.showQuickPick([COPY, ISSUE, DOCUMENT, LOG], {
    title: "Report a problem",
    placeHolder: "The report includes your environment, diagnostics and this session's errors",
  });
  if (!choice) return;

  if (choice === COPY) {
    await vscode.env.clipboard.writeText(report);
    vscode.window.showInformationMessage("Report copied. Paste it into the issue.");
    return;
  }
  if (choice === ISSUE) {
    // The clipboard carries the full text; the URL may be truncated.
    await vscode.env.clipboard.writeText(report);
    await vscode.env.openExternal(
      vscode.Uri.parse(buildIssueUrl(REPO_URL, DEFAULT_ISSUE_TITLE, report)),
    );
    return;
  }
  if (choice === DOCUMENT) {
    const doc = await vscode.workspace.openTextDocument({ content: report, language: "markdown" });
    await vscode.window.showTextDocument(doc, { preview: false });
    return;
  }
  getOutputChannel().show(true);
}

export const __internals = {
  formatReport,
  formatChecksPlain,
  compareSemver,
  checkVsCodeVersion,
  checkWorkspace,
  REPO_URL,
};
