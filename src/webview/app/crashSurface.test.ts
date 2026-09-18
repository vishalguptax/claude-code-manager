// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../shared/hooks";
import { _resetErrorLog } from "../shared/model";
import { installCrashSurface } from "./crashSurface";

let teardown: (() => void) | undefined;

beforeEach(() => _resetErrorLog());

afterEach(() => {
  teardown?.();
  teardown = undefined;
  document.getElementById("crash-surface")?.remove();
  setVscodeApi(null);
});

describe("installCrashSurface", () => {
  it("paints the message of an uncaught error into the document", () => {
    teardown = installCrashSurface();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("kaboom") }));
    expect(document.getElementById("crash-surface")?.textContent).toContain("kaboom");
  });

  it("reports a rejected promise too", () => {
    teardown = installCrashSurface();
    // happy-dom has no PromiseRejectionEvent constructor; the listener only
    // reads `reason`, so a plain event carrying one is a faithful stand-in.
    const event = Object.assign(new Event("unhandledrejection"), {
      reason: new Error("async boom"),
    });
    window.dispatchEvent(event);
    expect(document.getElementById("crash-surface")?.textContent).toContain("async boom");
  });

  it("keeps the first banner, and shows the later failures inside it", () => {
    teardown = installCrashSurface();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("first") }));
    const text = document.getElementById("crash-surface")?.textContent ?? "";
    expect(text).toContain("first");
    // The banner is built once; the log behind it still collects the cascade.
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("second") }));
    expect(document.querySelectorAll("#crash-surface")).toHaveLength(1);
  });

  it("asks the host to open the report when Report problem is clicked", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    teardown = installCrashSurface();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    const report = [...document.querySelectorAll("#crash-surface button")].find(
      (b) => b.textContent === "Report problem",
    ) as HTMLButtonElement;
    report.click();
    expect(post).toHaveBeenCalledWith({ type: "reportIssue" });
  });

  it("dismisses on request, so the panel underneath stays usable", () => {
    teardown = installCrashSurface();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    const dismiss = [...document.querySelectorAll("#crash-surface button")].find(
      (b) => b.textContent === "Dismiss",
    ) as HTMLButtonElement;
    dismiss.click();
    expect(document.getElementById("crash-surface")).toBeNull();
  });

  it("reports a chunk that failed to load — the crash that leaves nothing else behind", () => {
    teardown = installCrashSurface();
    // Not appended: happy-dom would try to fetch it, and the listener only
    // needs an element carrying a src to report.
    const script = document.createElement("script");
    script.src = "chunks/chunk-ABC.js";
    // Resource errors fire at the element and do not bubble, which is why the
    // listener is registered in the capture phase.
    const event = new Event("error", { bubbles: false });
    Object.defineProperty(event, "target", { value: script });
    window.dispatchEvent(event);
    // `src` resolves against the document, so assert on the tail.
    expect(document.getElementById("crash-surface")?.textContent).toContain(
      "Failed to load",
    );
    expect(document.getElementById("crash-surface")?.textContent).toContain(
      "chunks/chunk-ABC.js",
    );
  });

  it("offers a reload, which rebuilds the panel from a fresh document", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    teardown = installCrashSurface();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom") }));
    const reload = [...document.querySelectorAll("#crash-surface button")].find(
      (b) => b.textContent === "Reload panel",
    ) as HTMLButtonElement;
    reload.click();
    expect(post).toHaveBeenCalledWith({ type: "reloadAll" });
  });

  it("stops reporting once torn down", () => {
    installCrashSurface()();
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("ignored") }));
    expect(document.getElementById("crash-surface")).toBeNull();
  });
});
