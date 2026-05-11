// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { skeletonListHtml } from "../loader";

describe("skeletonListHtml", () => {
  it("returns markup with aria-busy status region carrying the label", () => {
    const html = skeletonListHtml("Loading commands…");
    const root = document.createElement("div");
    root.innerHTML = html;
    const status = root.querySelector(".panel-loader");
    expect(status).not.toBeNull();
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    expect(status?.getAttribute("aria-label")).toBe("Loading commands…");
  });

  it("renders six placeholder rows with title and sub bars, hidden from AT", () => {
    const root = document.createElement("div");
    root.innerHTML = skeletonListHtml("Loading agents…");
    const list = root.querySelector(".skeleton-list");
    expect(list?.getAttribute("aria-hidden")).toBe("true");
    expect(root.querySelectorAll(".skeleton-row").length).toBe(6);
    expect(root.querySelectorAll(".skeleton-bar-title").length).toBe(6);
    expect(root.querySelectorAll(".skeleton-bar-sub").length).toBe(6);
  });

  it("HTML-escapes nothing — label is trusted internal copy, callers must not pass user input", () => {
    // Documents the contract: label is hardcoded by call sites, not user-supplied.
    const html = skeletonListHtml("Loading <stuff>");
    expect(html).toContain("Loading <stuff>");
  });
});
