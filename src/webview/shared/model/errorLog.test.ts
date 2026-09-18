import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetErrorLog,
  formatErrorLog,
  getErrorLog,
  recordError,
  setErrorSink,
} from "./errorLog";

afterEach(() => _resetErrorLog());

describe("recordError", () => {
  it("keeps the name, message and stack of a thrown Error", () => {
    const entry = recordError("render", new TypeError("x is not a function"));
    expect(entry.source).toBe("render");
    expect(entry.message).toBe("TypeError: x is not a function");
    expect(entry.stack).toContain("TypeError");
    expect(getErrorLog()).toHaveLength(1);
  });

  it("accepts a non-Error throw", () => {
    expect(recordError("handler", "plain string").message).toBe("plain string");
  });

  it("forwards each entry to the host sink", () => {
    const sink = vi.fn();
    setErrorSink(sink);
    recordError("window", new Error("boom"));
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ message: "Error: boom" }));
  });

  it("survives a sink that throws — the log is the fallback, not the casualty", () => {
    setErrorSink(() => {
      throw new Error("bridge down");
    });
    expect(() => recordError("window", new Error("boom"))).not.toThrow();
    expect(getErrorLog()).toHaveLength(1);
  });

  it("caps the log so a per-frame crash cannot grow it forever", () => {
    for (let i = 0; i < 40; i++) recordError("render", new Error(`e${i}`));
    const log = getErrorLog();
    expect(log).toHaveLength(25);
    // Oldest dropped, newest kept.
    expect(log[log.length - 1].message).toBe("Error: e39");
  });
});

describe("formatErrorLog", () => {
  it("says so when nothing has failed", () => {
    expect(formatErrorLog()).toBe("No errors recorded.");
  });

  it("renders each entry with its timestamp, source and stack", () => {
    recordError("render", new Error("boom"));
    const text = formatErrorLog();
    expect(text).toContain("(render) Error: boom");
    expect(text).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
  });
});
