import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hostBusy, noteAck, noteRequest, _resetHostBusy } from "../hostBusy";

beforeEach(() => {
  vi.useFakeTimers();
  _resetHostBusy();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hostBusy", () => {
  it("stays quiet for fast round-trips (no flash)", () => {
    noteRequest();
    vi.advanceTimersByTime(100);
    noteAck();
    vi.advanceTimersByTime(1_000);
    expect(hostBusy.value).toBe(false);
  });

  it("arms after the delay while a request is outstanding", () => {
    noteRequest();
    expect(hostBusy.value).toBe(false);
    vi.advanceTimersByTime(301);
    expect(hostBusy.value).toBe(true);
  });

  it("clears when the last outstanding request acks", () => {
    noteRequest();
    noteRequest();
    vi.advanceTimersByTime(301);
    expect(hostBusy.value).toBe(true);
    noteAck();
    expect(hostBusy.value).toBe(true); // one still in flight
    noteAck();
    expect(hostBusy.value).toBe(false);
  });

  it("force-clears if the host never acks (crash / reload)", () => {
    noteRequest();
    vi.advanceTimersByTime(301);
    expect(hostBusy.value).toBe(true);
    vi.advanceTimersByTime(15_000);
    expect(hostBusy.value).toBe(false);
  });

  it("ignores stray acks with nothing outstanding", () => {
    noteAck();
    expect(hostBusy.value).toBe(false);
    noteRequest();
    vi.advanceTimersByTime(301);
    expect(hostBusy.value).toBe(true);
  });
});
