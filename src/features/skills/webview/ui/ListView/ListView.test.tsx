// @vitest-environment happy-dom
import { h } from "preact";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import { makeSkill } from "../../__tests__/fixtures";
import {
  claudeCodeInstalled,
  marketplaceSkillsUrl,
  scopeFilter,
  searchQuery,
  selectedSkill,
  skills,
} from "../../model";
import { ListView } from "./ListView";

afterEach(cleanup);

const post = vi.fn();
beforeEach(() => {
  post.mockReset();
  setVscodeApi({ postMessage: post });
  skills.value = [];
  selectedSkill.value = null;
  searchQuery.value = "";
  scopeFilter.value = "all";
  claudeCodeInstalled.value = false;
  marketplaceSkillsUrl.value = "https://market";
});

describe("ListView", () => {
  it("shows the discovery empty state with no skills", () => {
    render(h(ListView, {}));
    expect(screen.getByText("No skills found")).toBeTruthy();
    fireEvent.click(screen.getByText(/Browse community skills/));
    expect(post).toHaveBeenCalledWith({ type: "openUrl", url: "https://market" });
  });

  it("renders scope filter counts and the list", () => {
    skills.value = [
      makeSkill({ id: "p", name: "proj", scope: "project" }),
      makeSkill({ id: "g", name: "glob", scope: "global" }),
    ];
    render(h(ListView, {}));
    expect(screen.getByText("All (2)")).toBeTruthy();
    expect(screen.getByText("Project (1)")).toBeTruthy();
    expect(screen.getByText("Global (1)")).toBeTruthy();
    expect(screen.getByText("proj")).toBeTruthy();
    expect(screen.getByText("glob")).toBeTruthy();
  });

  it("renders a Plugin filter only when plugin skills exist", () => {
    skills.value = [makeSkill({ id: "g", scope: "global" })];
    render(h(ListView, {}));
    expect(screen.queryByText(/^Plugin \(/)).toBeNull();
    cleanup();
    skills.value = [makeSkill({ id: "x", scope: "plugin", pluginName: "cm" })];
    render(h(ListView, {}));
    expect(screen.getByText("Plugin (1)")).toBeTruthy();
  });

  it("clicking a scope tab updates the filter signal", () => {
    skills.value = [
      makeSkill({ id: "p", name: "proj", scope: "project" }),
      makeSkill({ id: "g", name: "glob", scope: "global" }),
    ];
    render(h(ListView, {}));
    fireEvent.click(screen.getByText("Global (1)"));
    expect(scopeFilter.value).toBe("global");
  });

  it("selecting a skill sets the signal and requests detail", () => {
    skills.value = [makeSkill({ id: "global:lint", name: "lint" })];
    render(h(ListView, {}));
    fireEvent.click(document.querySelector(".skill-item") as HTMLElement);
    expect(selectedSkill.value?.id).toBe("global:lint");
    expect(post).toHaveBeenCalledWith({ type: "getSkillDetail", skillId: "global:lint" });
  });

  it("refresh button requests the skills list", () => {
    render(h(ListView, {}));
    fireEvent.click(screen.getByTitle("Refresh skills list"));
    expect(post).toHaveBeenCalledWith({ type: "getSkills" });
  });

  it("globe and refresh icon buttons have an accessible name", () => {
    render(h(ListView, {}));
    expect(screen.getByLabelText("Browse community skills (opens externally)")).toBeTruthy();
    expect(screen.getByLabelText("Refresh skills list")).toBeTruthy();
  });

  it("debounced search filters the list and shows a no-match empty state", async () => {
    skills.value = [
      makeSkill({ id: "1", name: "alpha" }),
      makeSkill({ id: "2", name: "beta" }),
    ];
    const { container } = render(h(ListView, {}));
    const field = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(field, { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByText("No matching skills")).toBeTruthy());
  });

  it("virtualizes lists longer than the threshold", () => {
    skills.value = Array.from({ length: 60 }, (_, i) =>
      makeSkill({ id: `g:${i}`, name: `skill-${i}`, scope: "global" }),
    );
    render(h(ListView, {}));
    expect(document.querySelector(".virtual-list")).toBeTruthy();
  });
});
