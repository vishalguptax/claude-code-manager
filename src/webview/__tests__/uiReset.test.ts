// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { installUiResetHandlers } from "../uiReset";

beforeEach(() => {
  document.body.innerHTML = "";
});

function fireBlur(): void {
  window.dispatchEvent(new Event("blur"));
}

describe("installUiResetHandlers", () => {
  it("is idempotent — registering twice does not double-fire handlers", () => {
    installUiResetHandlers();
    installUiResetHandlers();

    document.body.innerHTML = `<div id="ctxMenu"></div>`;
    fireBlur();
    // ctxMenu was removed
    expect(document.getElementById("ctxMenu")).toBeNull();
    // No exception on the second blur
    document.body.innerHTML = `<div id="ctxMenu"></div>`;
    fireBlur();
    expect(document.getElementById("ctxMenu")).toBeNull();
  });
});

describe("blur handler — transient overlay cleanup", () => {
  it("removes an open context menu", () => {
    installUiResetHandlers();
    document.body.innerHTML = `
      <div id="ctxMenu" class="ctx-menu">
        <div class="ctx-item">Pin</div>
      </div>
    `;
    fireBlur();
    expect(document.getElementById("ctxMenu")).toBeNull();
  });

  it("hides any open dropdown menu", () => {
    installUiResetHandlers();
    document.body.innerHTML = `
      <div class="dropdown-menu">visible</div>
      <div class="dropdown-menu hidden">already hidden</div>
    `;
    fireBlur();
    const menus = document.querySelectorAll<HTMLElement>(".dropdown-menu");
    for (const m of menus) {
      expect(m.classList.contains("hidden")).toBe(true);
    }
  });

  it("strips .copied flash class from copy buttons", () => {
    installUiResetHandlers();
    document.body.innerHTML = `
      <button class="item-copy-btn copied">Copied</button>
      <button class="item-copy-btn copied">Copied</button>
      <button class="item-copy-btn">Copy</button>
    `;
    fireBlur();
    expect(document.querySelectorAll(".copied").length).toBe(0);
    expect(document.querySelectorAll(".item-copy-btn").length).toBe(3);
  });

  it("does nothing when no transient overlays are present", () => {
    installUiResetHandlers();
    document.body.innerHTML = `<div class="ordinary-content">Hello</div>`;
    expect(() => fireBlur()).not.toThrow();
    expect(document.querySelector(".ordinary-content")).not.toBeNull();
  });
});

describe("visibilitychange handler", () => {
  it("fires the same cleanup when the document becomes hidden", () => {
    installUiResetHandlers();
    document.body.innerHTML = `<div id="ctxMenu">menu</div>`;

    // happy-dom doesn't allow direct write to visibilityState; stub it.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(document.getElementById("ctxMenu")).toBeNull();
  });

  it("does not fire cleanup when the document becomes visible", () => {
    installUiResetHandlers();
    document.body.innerHTML = `<div id="ctxMenu">menu</div>`;

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(document.getElementById("ctxMenu")).not.toBeNull();
  });
});
