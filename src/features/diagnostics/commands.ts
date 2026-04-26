/**
 * Command-palette glue for the self-diagnostic. Runs the pure-fs
 * checks in `runner.ts`, layers in vscode-aware checks (workspace,
 * VS Code version), formats a markdown report, and opens it in an
 * editor tab so the user can read + copy + paste into a bug report.
 */
import * as vscode from "vscode";
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
    fixHint: "Upgrade VS Code — older builds lack the webview APIs Claude Manager uses.",
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
  lines.push("# Claude Manager — Diagnostic report");
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
export function runAllChecks(): DiagnosticCheck[] {
  return [...runDiagnostics(), checkVsCodeVersion(), checkWorkspace()];
}

/**
 * Top-level command handler. Surfaced in package.json as
 * `claudeManager.runDiagnostics`.
 */
export async function runDiagnosticsCommand(): Promise<void> {
  const checks = runAllChecks();
  const report = formatReport(checks);
  const doc = await vscode.workspace.openTextDocument({
    content: report,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: false });
}

export const __internals = { formatReport, compareSemver, checkVsCodeVersion, checkWorkspace };
