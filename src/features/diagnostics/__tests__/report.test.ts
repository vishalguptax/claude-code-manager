import { describe, expect, it } from "vitest";
import { buildIssueUrl, buildReport, MAX_ISSUE_BODY } from "../report";

const env = {
  extensionVersion: "2.12.0",
  vscodeVersion: "1.99.0",
  platform: "darwin",
  osRelease: "electron 34.0.0",
};

describe("buildReport", () => {
  it("carries the environment and the error log", () => {
    const md = buildReport({ env, errors: "TypeError: x is not a function" });
    expect(md).toContain("- Extension: 2.12.0");
    expect(md).toContain("- VS Code: 1.99.0");
    expect(md).toContain("- Platform: darwin (electron 34.0.0)");
    expect(md).toContain("TypeError: x is not a function");
  });

  it("includes the diagnostics section only when checks were run", () => {
    expect(buildReport({ env, errors: "none" })).not.toContain("### Diagnostics");
    expect(buildReport({ env, errors: "none", checks: "[ OK ] all" })).toContain("### Diagnostics");
  });
});

describe("buildIssueUrl", () => {
  it("prefills the title and body on the repo's new-issue form", () => {
    const url = buildIssueUrl("https://github.com/owner/repo", "Bug: ", "body text");
    expect(url.startsWith("https://github.com/owner/repo/issues/new?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("title")).toBe("Bug: ");
    expect(params.get("body")).toBe("body text");
  });

  it("normalises a .git or trailing-slash repository URL", () => {
    expect(buildIssueUrl("https://github.com/owner/repo.git", "t", "b")).toContain(
      "/owner/repo/issues/new",
    );
    expect(buildIssueUrl("https://github.com/owner/repo/", "t", "b")).toContain(
      "/owner/repo/issues/new",
    );
  });

  it("truncates a stack-heavy body rather than producing a URL servers reject", () => {
    const body = "x".repeat(MAX_ISSUE_BODY + 500);
    const sent = new URL(buildIssueUrl("https://github.com/o/r", "t", body)).searchParams.get(
      "body",
    );
    expect(sent?.length).toBeLessThan(body.length);
    expect(sent).toContain("truncated");
  });
});
