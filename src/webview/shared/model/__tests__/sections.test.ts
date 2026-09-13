import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetSections,
  collapsedSections,
  isSectionCollapsed,
  toggleSection,
} from "../sections";

describe("collapsed sections store", () => {
  beforeEach(() => {
    _resetSections();
  });

  it("starts with everything expanded", () => {
    expect(isSectionCollapsed("account:usage")).toBe(false);
    expect(collapsedSections.value.size).toBe(0);
  });

  it("toggles one id on and back off", () => {
    toggleSection("config:permissions");
    expect(isSectionCollapsed("config:permissions")).toBe(true);
    toggleSection("config:permissions");
    expect(isSectionCollapsed("config:permissions")).toBe(false);
  });

  it("produces a new Set per toggle so signal subscribers re-render", () => {
    const before = collapsedSections.value;
    toggleSection("account:profile");
    expect(collapsedSections.value).not.toBe(before);
  });

  it("keeps ids from different tabs independent", () => {
    // The whole reason ids carry a tab prefix: Account and Config both have a
    // section the user would call "permissions", and one store holds both.
    toggleSection("config:permissions");
    expect(isSectionCollapsed("config:permissions")).toBe(true);
    expect(isSectionCollapsed("account:permissions")).toBe(false);
  });

  it("holds several collapsed sections at once", () => {
    toggleSection("config:permissions");
    toggleSection("config:snapshots");
    toggleSection("account:usage");
    expect(collapsedSections.value.size).toBe(3);
    toggleSection("config:snapshots");
    expect([...collapsedSections.value].sort()).toEqual([
      "account:usage",
      "config:permissions",
    ]);
  });

  it("forgets everything on reset", () => {
    toggleSection("config:settings");
    _resetSections();
    expect(collapsedSections.value.size).toBe(0);
  });
});
