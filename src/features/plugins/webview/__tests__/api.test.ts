import { describe, expect, it, vi } from "vitest";
import { createPluginsApi } from "../api";

function setup() {
  const post = vi.fn();
  return { post, api: createPluginsApi(post) };
}

describe("createPluginsApi", () => {
  it("asks for a snapshot", () => {
    const { post, api } = setup();
    api.getPlugins();
    expect(post).toHaveBeenCalledWith({ type: "getPlugins" });
  });

  it("sends the plugin id, never a path, for a directory reveal", () => {
    const { post, api } = setup();
    api.openDirectory("caveman@caveman");
    expect(post).toHaveBeenCalledWith({
      type: "openPluginDirectory",
      id: "caveman@caveman",
    });
  });

  it("names the scope when opening a settings file", () => {
    const { post, api } = setup();
    api.openSettings("local");
    expect(post).toHaveBeenCalledWith({ type: "openPluginSettings", scope: "local" });
  });

  it("copies an id", () => {
    const { post, api } = setup();
    api.copyId("claude-seo@agricidaniel-claude-seo");
    expect(post).toHaveBeenCalledWith({
      type: "copyPluginId",
      id: "claude-seo@agricidaniel-claude-seo",
    });
  });

  it("always carries an explicit scope on a toggle", () => {
    const { post, api } = setup();
    api.setEnabled("caveman@caveman", false, "project");
    expect(post).toHaveBeenCalledWith({
      type: "setPluginEnabled",
      id: "caveman@caveman",
      enabled: false,
      scope: "project",
    });
  });

  it("returns a fresh bridge each call without sending anything", () => {
    const { post } = setup();
    expect(post).not.toHaveBeenCalled();
  });
});
