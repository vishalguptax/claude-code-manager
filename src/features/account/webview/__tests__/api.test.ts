// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../webview/hooks/useApi";
import { useAccountApi } from "../api";

describe("useAccountApi (typed Preact bridge)", () => {
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    post = vi.fn();
    setVscodeApi({ postMessage: post });
  });
  afterEach(() => setVscodeApi(null));

  it("posts validated message shapes", () => {
    const api = useAccountApi();
    api.getAccountData();
    api.fetchQuota();
    api.setModel("opus");
    api.setVoiceEnabled(true);
    api.removePermission("global", "Bash(rm)", "deny");
    api.openAccountUrl("https://claude.ai");
    api.launchSlash("/login");
    api.openAccountSwitcher();
    api.promptSaveProfile();
    api.restoreClaudeConfig();
    api.setCommitAttribution("by me");
    api.setPrAttribution("by me");
    api.openSettingsFile("project");
    api.promptAddPermission("local", "allow");

    expect(post).toHaveBeenCalledWith({ type: "getAccountData" });
    expect(post).toHaveBeenCalledWith({ type: "fetchQuota" });
    expect(post).toHaveBeenCalledWith({ type: "setModel", model: "opus" });
    expect(post).toHaveBeenCalledWith({ type: "setVoiceEnabled", value: true });
    expect(post).toHaveBeenCalledWith({
      type: "removePermission",
      scope: "global",
      tool: "Bash(rm)",
      list: "deny",
    });
    expect(post).toHaveBeenCalledTimes(14);
  });
});
