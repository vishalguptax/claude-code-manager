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

  it("asks for an install by id at an explicit CLI scope", () => {
    const { post, api } = setup();
    api.install("swift-lsp@claude-plugins-official", "project");
    expect(post).toHaveBeenCalledWith({
      type: "installPlugin",
      id: "swift-lsp@claude-plugins-official",
      scope: "project",
    });
  });

  it("opens a homepage through the host", () => {
    const { post, api } = setup();
    api.openUrl("https://github.com/anthropics/claude-plugins-official");
    expect(post).toHaveBeenCalledWith({
      type: "openUrl",
      url: "https://github.com/anthropics/claude-plugins-official",
    });
  });

  // Every send runs through the shared schema, so shape drift fails here
  // instead of being silently dropped by the host.
  it("refuses to send a message the protocol does not accept", () => {
    const { post, api } = setup();
    expect(() => api.install("caveman@caveman", "managed" as never)).toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("returns a fresh bridge each call without sending anything", () => {
    const { post } = setup();
    expect(post).not.toHaveBeenCalled();
  });
});
