// @vitest-environment happy-dom
import { h } from "preact";
import { cleanup, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../../webview/shared/hooks";
import { makeSkill } from "../../__tests__/fixtures";
import { claudeCodeInstalled, selectedSkill } from "../../model";
import { DetailView, stripFrontmatter } from "./DetailView";

afterEach(cleanup);

const post = vi.fn();
beforeEach(() => {
  post.mockReset();
  setVscodeApi({ postMessage: post });
  claudeCodeInstalled.value = false;
  selectedSkill.value = makeSkill();
});

describe("stripFrontmatter", () => {
  it("removes leading YAML frontmatter", () => {
    expect(stripFrontmatter("---\nname: x\n---\nbody")).toBe("body");
  });
  it("returns content unchanged when no frontmatter", () => {
    expect(stripFrontmatter("just body")).toBe("just body");
  });
});

describe("DetailView", () => {
  it("renders name, scope, path and body", () => {
    render(
      h(DetailView, {
        skill: makeSkill({ name: "lint", scope: "project", path: "/p", content: "---\nx: 1\n---\nHELLO" }),
      }),
    );
    expect(screen.getByText("lint")).toBeTruthy();
    expect(screen.getByText("/p")).toBeTruthy();
    expect(screen.getByText("HELLO")).toBeTruthy();
  });

  it("Back button clears the selection", () => {
    render(h(DetailView, { skill: makeSkill() }));
    fireEvent.click(screen.getByText(/Back/));
    expect(selectedSkill.value).toBeNull();
  });

  it("Open Claude posts newSession", () => {
    render(h(DetailView, { skill: makeSkill() }));
    fireEvent.click(screen.getByText(/Open Claude/));
    expect(post).toHaveBeenCalledWith({ type: "newSession" });
  });

  it("Open File posts the skill path", () => {
    render(h(DetailView, { skill: makeSkill({ path: "/p" }) }));
    fireEvent.click(screen.getByText(/Open File/));
    expect(post).toHaveBeenCalledWith({ type: "openSkillFile", skillPath: "/p" });
  });

  it("Delete posts the skill path", () => {
    render(h(DetailView, { skill: makeSkill({ path: "/p" }) }));
    fireEvent.click(screen.getByText(/Delete/));
    expect(post).toHaveBeenCalledWith({ type: "deleteSkill", skillPath: "/p" });
  });

  it("hides Open in Chat unless the Claude Code extension is installed", () => {
    render(h(DetailView, { skill: makeSkill() }));
    expect(screen.queryByText(/Open in Chat/)).toBeNull();
  });

  it("shows and wires Open in Chat when installed", () => {
    claudeCodeInstalled.value = true;
    render(h(DetailView, { skill: makeSkill({ name: "lint" }) }));
    fireEvent.click(screen.getByText(/Open in Chat/));
    expect(post).toHaveBeenCalledWith({ type: "launchChatWithPrompt", prompt: "/lint" });
  });
});
