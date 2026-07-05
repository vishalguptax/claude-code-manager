import { describe, it, expect } from "vitest";
import { Uri } from "vscode";
import type * as vscode from "vscode";
import { getWebviewHtml } from "../html";

/**
 * Minimal webview stub: `asWebviewUri` echoes the path (enough to assert the
 * script/style tags point at the built bundles) and `cspSource` is a fixed
 * origin so the CSP directives are checkable.
 */
function fakeWebview(): vscode.Webview {
  return {
    cspSource: "vscode-resource://host",
    asWebviewUri: (uri: { path: string }) => ({ toString: () => uri.path }),
  } as unknown as vscode.Webview;
}

describe("getWebviewHtml", () => {
  const html = getWebviewHtml(fakeWebview(), Uri.file("/ext") as vscode.Uri);

  it("references the built webview bundles", () => {
    expect(html).toContain("/ext/dist/webview/main.js");
    expect(html).toContain("/ext/dist/webview/styles.css");
  });

  it("locks the CSP down: no default source, scripts only via nonce, no network", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toMatch(/script-src 'nonce-[A-Za-z0-9]+'/);
  });

  it("threads the same nonce onto the script tag as the CSP allows", () => {
    const cspNonce = html.match(/script-src 'nonce-([A-Za-z0-9]+)'/)?.[1];
    const tagNonce = html.match(/<script type="module" nonce="([A-Za-z0-9]+)"/)?.[1];
    expect(cspNonce).toBeTruthy();
    expect(tagNonce).toBe(cspNonce);
  });

  it("declares a theme-aware color-scheme so native controls adapt", () => {
    expect(html).toContain("color-scheme: light dark");
  });

  it("does not permit inline scripts (no unsafe-inline in script-src)", () => {
    const scriptSrc = html.match(/script-src [^;]+/)?.[0] ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
  });
});
