// @vitest-environment happy-dom
import { h } from "preact";
import { cleanup, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { Message } from "../../../../shared/protocol/messages";
import SkillsTab, { registerSkillsHandlers } from "../index";
import {
  claudeCodeInstalled,
  marketplaceSkillsUrl,
  selectedSkill,
  skills,
} from "../signals";
import { makeSkill } from "./fixtures";

afterEach(cleanup);

beforeEach(() => {
  _resetMessageBus();
  skills.value = [];
  selectedSkill.value = null;
  claudeCodeInstalled.value = false;
  marketplaceSkillsUrl.value = "default";
});

describe("registerSkillsHandlers", () => {
  it("populates the skills signal from a skills message", () => {
    registerSkillsHandlers();
    dispatch({ type: "skills", data: [makeSkill({ id: "a" })] } as Message);
    expect(skills.value.map((s) => s.id)).toEqual(["a"]);
  });

  it("re-resolves the selection against a fresh list", () => {
    selectedSkill.value = makeSkill({ id: "a", name: "old" });
    registerSkillsHandlers();
    dispatch({ type: "skills", data: [makeSkill({ id: "a", name: "new" })] } as Message);
    expect(selectedSkill.value?.name).toBe("new");
  });

  it("clears the selection when the selected skill disappears", () => {
    selectedSkill.value = makeSkill({ id: "gone" });
    registerSkillsHandlers();
    dispatch({ type: "skills", data: [makeSkill({ id: "other" })] } as Message);
    expect(selectedSkill.value).toBeNull();
  });

  it("sets the selected skill from a skillDetail message", () => {
    registerSkillsHandlers();
    dispatch({ type: "skillDetail", data: makeSkill({ id: "d", name: "detail" }) } as Message);
    expect(selectedSkill.value?.name).toBe("detail");
  });

  it("reads marketplace url + install flag from settings", () => {
    registerSkillsHandlers();
    dispatch({
      type: "settings",
      marketplaceSkillsUrl: "https://mkt",
      claudeCodeExtensionInstalled: true,
    } as unknown as Message);
    expect(marketplaceSkillsUrl.value).toBe("https://mkt");
    expect(claudeCodeInstalled.value).toBe(true);
  });

  it("ignores a blank marketplace url", () => {
    registerSkillsHandlers();
    dispatch({ type: "settings", marketplaceSkillsUrl: "" } as unknown as Message);
    expect(marketplaceSkillsUrl.value).toBe("default");
  });

  it("disposer unregisters handlers", () => {
    const dispose = registerSkillsHandlers();
    dispose();
    dispatch({ type: "skills", data: [makeSkill({ id: "z" })] } as Message);
    expect(skills.value).toEqual([]);
  });
});

describe("SkillsTab", () => {
  it("requests the skills list on mount and renders the list view", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    render(h(SkillsTab, {}));
    expect(post).toHaveBeenCalledWith({ type: "getSkills" });
    expect(document.getElementById("skillsListView")).toBeTruthy();
  });

  it("renders the detail view when a skill is selected", () => {
    setVscodeApi({ postMessage: vi.fn() });
    selectedSkill.value = makeSkill({ name: "lint" });
    render(h(SkillsTab, {}));
    expect(document.getElementById("skillsDetailView")).toBeTruthy();
  });
});
