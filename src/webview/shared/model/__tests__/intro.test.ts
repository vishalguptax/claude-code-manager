import { beforeEach, describe, expect, it } from "vitest";
import { _resetIntro, closeIntro, introVisible, maybeShowIntro } from "../intro";

describe("intro model", () => {
  beforeEach(() => {
    _resetIntro();
  });

  it("stays hidden when the intro has already been seen", () => {
    maybeShowIntro(true);
    expect(introVisible.value).toBe(false);
  });

  it("opens once when the intro has never been seen", () => {
    maybeShowIntro(false);
    expect(introVisible.value).toBe(true);
  });

  it("does not reopen after being closed, even on a re-pushed demoSeen=false", () => {
    maybeShowIntro(false);
    closeIntro();
    expect(introVisible.value).toBe(false);
    // Host re-pushes settings with demoSeen still false before markDemoSeen
    // persists — the session latch must keep it closed.
    maybeShowIntro(false);
    expect(introVisible.value).toBe(false);
  });

  it("does not reopen once shown, even before it is closed", () => {
    maybeShowIntro(false);
    introVisible.value = false; // simulate an unrelated hide
    maybeShowIntro(false);
    expect(introVisible.value).toBe(false);
  });

  it("_resetIntro clears the latch so it can show again", () => {
    maybeShowIntro(false);
    closeIntro();
    _resetIntro();
    maybeShowIntro(false);
    expect(introVisible.value).toBe(true);
  });
});
