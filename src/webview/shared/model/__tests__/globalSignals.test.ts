import { describe, it, expect, beforeEach } from "vitest";
import type { Message } from "../../../../shared/protocol/schemas";
import {
  activeTab,
  applyShellSettings,
  density,
  hiddenTabsPref,
  ready,
  tabOrderPref,
  theme,
} from "../globalSignals";

/** Build a `settings` message with an arbitrary density payload. The host
 *  variant is a loose object, so density may be absent, or a value the
 *  webview does not know. */
function settingsMsg(value?: unknown): Message {
  return { type: "settings", ...(value === undefined ? {} : { density: value }) } as Message;
}

/** A `settings` message carrying arbitrary hiddenTabs/tabOrder payloads. */
function tabPrefsMsg(hiddenTabs?: unknown, tabOrder?: unknown): Message {
  return {
    type: "settings",
    ...(hiddenTabs === undefined ? {} : { hiddenTabs }),
    ...(tabOrder === undefined ? {} : { tabOrder }),
  } as Message;
}

describe("globalSignals", () => {
  beforeEach(() => {
    density.value = "comfortable";
    hiddenTabsPref.value = [];
    tabOrderPref.value = [];
  });

  it("has sensible defaults", () => {
    expect(activeTab.value).toBe("sessions");
    expect(ready.value).toBe(false);
    expect(theme.value).toBe("dark");
  });

  it("activeTab is mutable", () => {
    const prev = activeTab.value;
    activeTab.value = "skills";
    expect(activeTab.value).toBe("skills");
    activeTab.value = prev;
  });

  describe("density", () => {
    // The default has to match the setting's own default in package.json,
    // otherwise the first paint is the wrong density until the host handshake
    // lands, and the panel visibly re-skins on open.
    it("defaults to comfortable, matching the setting default", () => {
      expect(density.value).toBe("comfortable");
    });

    it("applies quiet from the host settings push", () => {
      applyShellSettings(settingsMsg("quiet"));
      expect(density.value).toBe("quiet");
    });

    it("applies comfortable, so switching the setting back re-skins", () => {
      density.value = "quiet";
      applyShellSettings(settingsMsg("comfortable"));
      expect(density.value).toBe("comfortable");
    });

    // The value is stamped into the DOM and selected on by CSS. An unknown
    // string would match no rule and silently render comfortable anyway, so
    // normalise here and keep the signal's type honest for other readers.
    it("falls back to comfortable for an unknown value", () => {
      density.value = "quiet";
      applyShellSettings(settingsMsg("spacious"));
      expect(density.value).toBe("comfortable");
    });

    it("falls back to comfortable when the host omits density", () => {
      density.value = "quiet";
      applyShellSettings(settingsMsg());
      expect(density.value).toBe("comfortable");
    });

    it("falls back to comfortable for a non-string value", () => {
      density.value = "quiet";
      applyShellSettings(settingsMsg(42));
      expect(density.value).toBe("comfortable");
    });

    // The handler is registered against the "settings" type prefix, which
    // also matches any future type starting with those characters. Ignoring
    // anything that is not exactly `settings` keeps that safe.
    it("ignores messages that are not settings", () => {
      density.value = "quiet";
      applyShellSettings({ type: "ack" } as Message);
      expect(density.value).toBe("quiet");
    });
  });

  describe("hiddenTabsPref / tabOrderPref", () => {
    it("default to empty, matching the settings' own defaults", () => {
      expect(hiddenTabsPref.value).toEqual([]);
      expect(tabOrderPref.value).toEqual([]);
    });

    it("applies both from the host settings push", () => {
      applyShellSettings(tabPrefsMsg(["checkpoints", "prompts"], ["account", "config"]));
      expect(hiddenTabsPref.value).toEqual(["checkpoints", "prompts"]);
      expect(tabOrderPref.value).toEqual(["account", "config"]);
    });

    it("resets to empty when the host omits the field", () => {
      hiddenTabsPref.value = ["skills"];
      tabOrderPref.value = ["mcp"];
      applyShellSettings(settingsMsg("comfortable"));
      expect(hiddenTabsPref.value).toEqual([]);
      expect(tabOrderPref.value).toEqual([]);
    });

    it("drops the whole value when it is not an array", () => {
      applyShellSettings(tabPrefsMsg("checkpoints", 42));
      expect(hiddenTabsPref.value).toEqual([]);
      expect(tabOrderPref.value).toEqual([]);
    });

    it("keeps only the string entries of an array with mixed content", () => {
      // A hand-edited settings.json is not bound by the manifest's `enum` —
      // only VS Code's own settings UI enforces that. A stray number or
      // object in the array must not corrupt the whole ordering pass.
      applyShellSettings(tabPrefsMsg(["skills", 7, null, "mcp"], [{ id: "config" }, "account"]));
      expect(hiddenTabsPref.value).toEqual(["skills", "mcp"]);
      expect(tabOrderPref.value).toEqual(["account"]);
    });

    it("ignores messages that are not settings", () => {
      hiddenTabsPref.value = ["skills"];
      applyShellSettings({ type: "ack" } as Message);
      expect(hiddenTabsPref.value).toEqual(["skills"]);
    });
  });
});
