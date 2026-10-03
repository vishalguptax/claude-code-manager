import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetConfigState,
  configData,
  configError,
  isSectionCollapsed,
  loading,
  permissionScope,
  permissionSearch,
  toggleSection,
} from "../model";
import { collapsedSections } from "../../../../webview/shared/model";
import { makeConfigData } from "./fixtures";

describe("config signals", () => {
  beforeEach(() => _resetConfigState());

  it("defaults to global scope, empty search, no data", () => {
    expect(configData.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(configError.value).toBe("");
    expect(permissionScope.value).toBe("global");
    expect(permissionSearch.value).toBe("");
  });

  it("holds the latest payload and ui state", () => {
    configData.value = makeConfigData();
    permissionScope.value = "project";
    permissionSearch.value = "bash";
    expect(configData.value?.profile.email).toBe("u@x.com");
    expect(permissionScope.value).toBe("project");
    expect(permissionSearch.value).toBe("bash");
  });

  it("toggles a section on and off", () => {
    expect(isSectionCollapsed("model")).toBe(false);
    toggleSection("model");
    expect(isSectionCollapsed("model")).toBe(true);
    // Ids are namespaced per tab so Config and Account cannot fold each
    // other's sections through the one shared store.
    expect(collapsedSections.value.has("config:model")).toBe(true);
    expect(collapsedSections.value.has("model")).toBe(false);
    toggleSection("model");
    expect(isSectionCollapsed("model")).toBe(false);
  });

  it("opens on model and permissions, with every other section folded", () => {
    expect(isSectionCollapsed("model")).toBe(false);
    expect(isSectionCollapsed("permissions")).toBe(false);
    for (const id of ["context", "git", "interface", "tabs", "history", "backup"]) {
      expect(isSectionCollapsed(id), id).toBe(true);
    }
    toggleSection("backup");
    expect(isSectionCollapsed("backup")).toBe(false);
  });

  it("_resetConfigState clears everything", () => {
    configData.value = makeConfigData();
    loading.value = true;
    configError.value = "boom";
    permissionScope.value = "local";
    permissionSearch.value = "x";
    toggleSection("history");
    _resetConfigState();
    expect(collapsedSections.value.size).toBe(0);
    expect(configData.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(configError.value).toBe("");
    expect(permissionScope.value).toBe("global");
    expect(permissionSearch.value).toBe("");
  });
});
