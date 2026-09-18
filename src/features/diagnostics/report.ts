/**
 * Bug-report assembly — the markdown body shared by "copy to clipboard",
 * "open as a document" and "open a prefilled GitHub issue".
 *
 * Pure so the report's shape is testable without a VS Code instance: the
 * caller gathers the environment and the logs, this turns them into text.
 */

export interface ReportEnvironment {
  extensionVersion: string;
  vscodeVersion: string;
  platform: string;
  /** e.g. "24.6.0" — a shell/CLI mismatch usually shows up here first. */
  osRelease?: string;
}

export interface ReportInput {
  env: ReportEnvironment;
  /** Formatted error log (host-side mirror of the webview's). */
  errors: string;
  /** Formatted diagnostic checks, when the report was built from the command. */
  checks?: string;
}

/** The issue title used when nothing more specific is known. */
export const DEFAULT_ISSUE_TITLE = "Bug: ";

/** Assemble the markdown body. */
export function buildReport({ env, errors, checks }: ReportInput): string {
  const lines = [
    "### What happened",
    "",
    "<!-- What you did, what you expected, what you got instead. -->",
    "",
    "### Environment",
    "",
    `- Extension: ${env.extensionVersion}`,
    `- VS Code: ${env.vscodeVersion}`,
    `- Platform: ${env.platform}${env.osRelease ? ` (${env.osRelease})` : ""}`,
    "",
    "### Errors",
    "",
    "```",
    errors,
    "```",
  ];
  if (checks) {
    lines.push("", "### Diagnostics", "", "```", checks, "```");
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * GitHub's new-issue URL with the body prefilled.
 *
 * Truncated to stay inside the URL length servers and browsers accept: a
 * stack-heavy report can run to tens of kilobytes, and a request that is
 * rejected outright is worse than one that says "see attached log". The
 * clipboard copy always carries the full text.
 */
export const MAX_ISSUE_BODY = 6000;

export function buildIssueUrl(repoUrl: string, title: string, body: string): string {
  const trimmed =
    body.length > MAX_ISSUE_BODY
      ? `${body.slice(0, MAX_ISSUE_BODY)}\n\n…truncated — paste the full report from the clipboard.`
      : body;
  const base = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const params = new URLSearchParams({ title, body: trimmed });
  return `${base}/issues/new?${params.toString()}`;
}
