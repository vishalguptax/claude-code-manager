import { beforeEach, describe, expect, it } from "vitest";
import { _resetIntro, closeIntro, introVisible, maybeShowIntro, showIntro } from "../intro";

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

  // A replay is a request, not a first run: it must open whatever the
  // stored flag and the session latch say.
  it("reopens on request after the intro was seen and dismissed", () => {
    maybeShowIntro(false);
    closeIntro();
    showIntro();
    expect(introVisible.value).toBe(true);
  });

  it("opens on request even when the host says it was seen on a past run", () => {
    maybeShowIntro(true);
    showIntro();
    expect(introVisible.value).toBe(true);
  });

  it("does not let a later settings push stack a second open on a replay", () => {
    showIntro();
    closeIntro();
    maybeShowIntro(false);
    expect(introVisible.value).toBe(false);
  });
});
