// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Intro } from "./Intro";
import { _resetIntro, introVisible } from "../../shared/model";
import { setVscodeApi } from "../../shared/hooks/useApi";
import { TABS } from "../../shared/model";

const posted: unknown[] = [];

beforeEach(() => {
  _resetIntro();
  posted.length = 0;
  setVscodeApi({ postMessage: (m) => posted.push(m) });
});

afterEach(() => {
  setVscodeApi(null);
  _resetIntro();
});

describe("Intro", () => {
  it("renders nothing until the intro is visible", () => {
    const { container } = render(<Intro />);
    expect(container.querySelector(".modal")).toBeNull();
  });

  it("names every surface once visible", () => {
    introVisible.value = true;
    render(<Intro />);
    expect(screen.getByText("Welcome to Claude Code Manager")).toBeTruthy();
    for (const t of TABS) {
      expect(screen.getByText(t.label)).toBeTruthy();
    }
    expect(screen.getByText("Get started")).toBeTruthy();
  });

  // The regression this guards: a tab is added to TABS and BLURBS is never
  // updated for it, so the row renders with an icon and a label and a
  // blank second line — the intro's whole job is explaining what each
  // surface does, and "names every surface" alone does not catch a name
  // with nothing said about it.
  it("gives every tab a non-empty blurb, not just a label", () => {
    introVisible.value = true;
    const { container } = render(<Intro />);
    const blurbs = container.querySelectorAll(".intro-item-blurb");
    expect(blurbs).toHaveLength(TABS.length);
    for (const b of blurbs) {
      expect(b.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("marks the intro seen and hides on Get started", () => {
    introVisible.value = true;
    render(<Intro />);
    fireEvent.click(screen.getByText("Get started"));
    expect(posted).toContainEqual({ type: "markDemoSeen" });
    expect(introVisible.value).toBe(false);
  });

  it("marks the intro seen on a backdrop dismissal", () => {
    introVisible.value = true;
    const { container } = render(<Intro />);
    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop, { detail: 1 });
    expect(posted).toContainEqual({ type: "markDemoSeen" });
    expect(introVisible.value).toBe(false);
  });
});
