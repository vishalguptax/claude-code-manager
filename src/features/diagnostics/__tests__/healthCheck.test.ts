import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetErrorLog, getErrors } from "../errorLog";
import { _resetHealthCheck, handlePong, pingWebview, PONG_TIMEOUT_MS } from "../healthCheck";

beforeEach(() => {
  vi.useFakeTimers();
  _resetHealthCheck();
  _resetErrorLog();
});

afterEach(() => {
  vi.useRealTimers();
  _resetHealthCheck();
  _resetErrorLog();
});

describe("pingWebview", () => {
  it("sends a ping with an incrementing id", () => {
    const post = vi.fn();
    pingWebview(post, "a settings push");
    pingWebview(post, "a settings push");
    expect(post.mock.calls.map(([m]) => m)).toEqual([
      { type: "ping", id: 1 },
      { type: "ping", id: 2 },
    ]);
  });

  it("records the silence when the panel never answers — the blank-screen case", () => {
    pingWebview(vi.fn(), "a settings push");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS + 1);
    expect(getErrors()).toHaveLength(1);
    expect(getErrors()[0].message).toContain("did not answer");
    expect(getErrors()[0].message).toContain("a settings push");
  });

  it("stays quiet when the panel answers in time", () => {
    pingWebview(vi.fn(), "a settings push");
    handlePong({ id: 1, tabs: 12, rootLength: 40000, activeTab: "config", errors: 0 });
    vi.advanceTimersByTime(PONG_TIMEOUT_MS + 1);
    expect(getErrors()).toHaveLength(0);
  });
});

describe("handlePong", () => {
  it("returns a census line for the log", () => {
    pingWebview(vi.fn(), "a settings push");
    const line = handlePong({ id: 1, tabs: 12, rootLength: 4000, activeTab: "config", errors: 2 });
    expect(line).toContain("tabs=12");
    expect(line).toContain("rootLength=4000");
    expect(line).toContain("activeTab=config");
    expect(line).toContain("errors=2");
  });

  it("flags a live script that rendered nothing — a blank panel with a pulse", () => {
    pingWebview(vi.fn(), "a settings push");
    handlePong({ id: 1, tabs: 0, rootLength: 0, activeTab: "config", errors: 0 });
    expect(getErrors()[0].message).toContain("rendered nothing");
  });

  it("marks an answer that arrives after the deadline as late, and keeps it", () => {
    pingWebview(vi.fn(), "a settings push");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS + 1);
    const line = handlePong({ id: 1, tabs: 12, rootLength: 10, activeTab: "config", errors: 0 });
    expect(line).toContain("late");
  });
});
