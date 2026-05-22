import { describe, expect, it, vi } from "vitest";
import {
  deleteSkill,
  getSkillDetail,
  getSkills,
  launchSkillInChat,
  newSession,
  openSkillFile,
  openUrl,
} from "../api";

describe("skills api", () => {
  it("getSkills posts a getSkills message", () => {
    const post = vi.fn();
    getSkills(post);
    expect(post).toHaveBeenCalledWith({ type: "getSkills" });
  });

  it("getSkillDetail posts the skill id", () => {
    const post = vi.fn();
    getSkillDetail(post, "global:demo");
    expect(post).toHaveBeenCalledWith({ type: "getSkillDetail", skillId: "global:demo" });
  });

  it("openSkillFile posts the path", () => {
    const post = vi.fn();
    openSkillFile(post, "/p");
    expect(post).toHaveBeenCalledWith({ type: "openSkillFile", skillPath: "/p" });
  });

  it("deleteSkill posts the path", () => {
    const post = vi.fn();
    deleteSkill(post, "/p");
    expect(post).toHaveBeenCalledWith({ type: "deleteSkill", skillPath: "/p" });
  });

  it("launchSkillInChat posts a slash-prefixed prompt", () => {
    const post = vi.fn();
    launchSkillInChat(post, "lint");
    expect(post).toHaveBeenCalledWith({ type: "launchChatWithPrompt", prompt: "/lint" });
  });

  it("newSession posts newSession", () => {
    const post = vi.fn();
    newSession(post);
    expect(post).toHaveBeenCalledWith({ type: "newSession" });
  });

  it("openUrl posts the url", () => {
    const post = vi.fn();
    openUrl(post, "https://x");
    expect(post).toHaveBeenCalledWith({ type: "openUrl", url: "https://x" });
  });
});
