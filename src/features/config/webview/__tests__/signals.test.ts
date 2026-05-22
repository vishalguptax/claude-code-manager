import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetConfigState,
  configData,
  configError,
  loading,
  permissionScope,
  permissionSearch,
} from "../signals";
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

  it("_resetConfigState clears everything", () => {
    configData.value = makeConfigData();
    loading.value = true;
    configError.value = "boom";
    permissionScope.value = "local";
    permissionSearch.value = "x";
    _resetConfigState();
    expect(configData.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(configError.value).toBe("");
    expect(permissionScope.value).toBe("global");
    expect(permissionSearch.value).toBe("");
  });
});
