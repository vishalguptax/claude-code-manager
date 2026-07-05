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
  errorMessage,
  loaded,
  marketplaceSkillsUrl,
  selectedSkill,
  skills,
} from "../model";
import { makeSkill } from "./fixtures";

afterEach(cleanup);

beforeEach(() => {
  _resetMessageBus();
  skills.value = [];
  selectedSkill.value = null;
  loaded.value = false;
  errorMessage.value = null;
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

  it("flips the loaded gate when the first skills message arrives (even if empty)", () => {
    registerSkillsHandlers();
    expect(loaded.value).toBe(false);
    dispatch({ type: "skills", data: [] } as Message);
    expect(loaded.value).toBe(true);
  });

  it("flips the loaded gate and sets errorMessage on a host error", () => {
    registerSkillsHandlers();
    expect(loaded.value).toBe(false);
    dispatch({ type: "error", message: "boom" } as Message);
    expect(loaded.value).toBe(true);
    expect(errorMessage.value).toBe("boom");
  });

  it("clears a prior error once a skills message succeeds", () => {
    registerSkillsHandlers();
    dispatch({ type: "error", message: "boom" } as Message);
    expect(errorMessage.value).toBe("boom");
    dispatch({ type: "skills", data: [] } as Message);
    expect(errorMessage.value).toBeNull();
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
  afterEach(() => setVscodeApi(null));

  it("shows the content-shaped list skeleton before the first skills message arrives", () => {
    setVscodeApi({ postMessage: vi.fn() });
    const { container } = render(h(SkillsTab, {}));
    // The <ListSkeleton> mirrors the list shell (search + scope + rows), not
    // the empty list.
    expect(container.querySelector(".skeleton-panel")).toBeTruthy();
    expect(container.querySelector(".skeleton-item")).toBeTruthy();
    expect(document.getElementById("skillsListView")).toBeNull();
  });

  it("requests the skills list on mount and renders the list view once loaded", () => {
    const post = vi.fn();
    setVscodeApi({ postMessage: post });
    loaded.value = true;
    render(h(SkillsTab, {}));
    expect(post).toHaveBeenCalledWith({ type: "getSkills" });
    expect(document.getElementById("skillsListView")).toBeTruthy();
  });

  it("shows the real empty-state (not the loader) after an empty skills list loads", () => {
    setVscodeApi({ postMessage: vi.fn() });
    loaded.value = true;
    skills.value = [];
    const { container } = render(h(SkillsTab, {}));
    expect(container.querySelector(".skeleton-panel")).toBeNull();
    expect(container.textContent).toContain("No skills found");
  });

  it("shows an error state (not the empty-list message) after a host parse failure", () => {
    setVscodeApi({ postMessage: vi.fn() });
    loaded.value = true;
    errorMessage.value = "Failed to parse SKILL.md";
    const { container } = render(h(SkillsTab, {}));
    expect(container.textContent).toContain("Error: Failed to parse SKILL.md");
    expect(container.textContent).not.toContain("No skills found");
  });

  it("renders the detail view when a skill is selected", () => {
    setVscodeApi({ postMessage: vi.fn() });
    selectedSkill.value = makeSkill({ name: "lint" });
    render(h(SkillsTab, {}));
    expect(document.getElementById("skillsDetailView")).toBeTruthy();
  });
});
