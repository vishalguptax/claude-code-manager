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
    expect(isSectionCollapsed("permissions")).toBe(false);
    toggleSection("permissions");
    expect(isSectionCollapsed("permissions")).toBe(true);
    // Ids are namespaced per tab so Config and Account cannot fold each
    // other's sections through the one shared store.
    expect(collapsedSections.value.has("config:permissions")).toBe(true);
    expect(collapsedSections.value.has("permissions")).toBe(false);
    toggleSection("permissions");
    expect(isSectionCollapsed("permissions")).toBe(false);
  });

  it("_resetConfigState clears everything", () => {
    configData.value = makeConfigData();
    loading.value = true;
    configError.value = "boom";
    permissionScope.value = "local";
    permissionSearch.value = "x";
    toggleSection("snapshots");
    _resetConfigState();
    expect(collapsedSections.value.size).toBe(0);
    expect(configData.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(configError.value).toBe("");
    expect(permissionScope.value).toBe("global");
    expect(permissionSearch.value).toBe("");
  });
});
