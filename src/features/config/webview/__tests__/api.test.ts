import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../api";

describe("createConfigApi", () => {
  it("posts validated messages for every action", () => {
    const post = vi.fn();
    const api = createConfigApi(post);

    api.getData();
    expect(post).toHaveBeenLastCalledWith({ type: "getAccountData" });

    api.setModel("opus");
    expect(post).toHaveBeenLastCalledWith({ type: "setModel", model: "opus" });

    api.promptCustomModel();
    expect(post).toHaveBeenLastCalledWith({ type: "promptCustomModel" });

    api.setVoiceEnabled(true);
    expect(post).toHaveBeenLastCalledWith({ type: "setVoiceEnabled", value: true });

    api.setCommitAttribution("x");
    expect(post).toHaveBeenLastCalledWith({ type: "setCommitAttribution", value: "x" });

    api.setPrAttribution("y");
    expect(post).toHaveBeenLastCalledWith({ type: "setPrAttribution", value: "y" });

    api.setSetting("includeCoAuthoredBy", true);
    expect(post).toHaveBeenLastCalledWith({
      type: "setSetting",
      key: "includeCoAuthoredBy",
      value: true,
      scope: "global",
    });

    api.setSetting("k", 1, "project");
    expect(post).toHaveBeenLastCalledWith({ type: "setSetting", key: "k", value: 1, scope: "project" });

    api.openSettingsFile("local");
    expect(post).toHaveBeenLastCalledWith({ type: "openSettingsFile", scope: "local" });

    api.openExtensionSettings();
    expect(post).toHaveBeenLastCalledWith({ type: "openExtensionSettings" });

    api.resetSettings("global");
    expect(post).toHaveBeenLastCalledWith({ type: "resetSettings", scope: "global" });

    api.launchSlash("/config");
    expect(post).toHaveBeenLastCalledWith({ type: "launchSlash", command: "/config" });

    api.runCommand("claudeManager.exportBrain");
    expect(post).toHaveBeenLastCalledWith({ type: "runCommand", command: "claudeManager.exportBrain" });

    api.promptAddPermission("global", "allow");
    expect(post).toHaveBeenLastCalledWith({ type: "promptAddPermission", scope: "global", list: "allow" });

    api.promptRemovePermission("global", "Bash", "deny");
    expect(post).toHaveBeenLastCalledWith({
      type: "promptRemovePermission",
      scope: "global",
      tool: "Bash",
      list: "deny",
    });

    api.promptAddDirectory();
    expect(post).toHaveBeenLastCalledWith({ type: "promptAddDirectory" });

    api.restoreSnapshot("global", "snap-1");
    expect(post).toHaveBeenLastCalledWith({
      type: "restoreSettingsSnapshot",
      scope: "global",
      snapshotId: "snap-1",
    });

    api.deleteSnapshot("project", "snap-2");
    expect(post).toHaveBeenLastCalledWith({
      type: "deleteSettingsSnapshot",
      scope: "project",
      snapshotId: "snap-2",
    });
  });
});
