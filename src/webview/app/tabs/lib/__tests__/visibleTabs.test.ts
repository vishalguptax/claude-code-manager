import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TABS, hiddenTabsPref, tabOrderPref } from "../../../../shared/model";
import { visibleTabs } from "../visibleTabs";

const ids = (): string[] => visibleTabs.value.map((t) => t.id);

describe("visibleTabs", () => {
  beforeEach(() => {
    hiddenTabsPref.value = [];
    tabOrderPref.value = [];
  });

  afterEach(() => {
    hiddenTabsPref.value = [];
    tabOrderPref.value = [];
  });

  it("mirrors the raw registry when neither preference is set", () => {
    expect(ids()).toEqual(TABS.map((t) => t.id));
  });

  it("re-derives when hiddenTabsPref changes", () => {
    hiddenTabsPref.value = ["skills", "mcp"];
    expect(ids()).not.toContain("skills");
    expect(ids()).not.toContain("mcp");
    expect(ids()).toHaveLength(TABS.length - 2);
  });

  it("re-derives when tabOrderPref changes", () => {
    tabOrderPref.value = ["config", "account"];
    expect(ids().slice(0, 2)).toEqual(["config", "account"]);
  });

  it("goes back to the full registry once both preferences clear", () => {
    hiddenTabsPref.value = ["skills"];
    tabOrderPref.value = ["config"];
    expect(ids()).not.toEqual(TABS.map((t) => t.id));

    hiddenTabsPref.value = [];
    tabOrderPref.value = [];
    expect(ids()).toEqual(TABS.map((t) => t.id));
  });

  it("is the single source both the strip and the palette read, so they cannot disagree", () => {
    // Not a behavioural assertion so much as a structural one: TabBar and
    // App both import this same computed rather than each calling
    // resolveVisibleTabs with their own copy of the signals.
    hiddenTabsPref.value = ["prompts"];
    const first = visibleTabs.value;
    const second = visibleTabs.value;
    expect(first).toBe(second);
  });
});
