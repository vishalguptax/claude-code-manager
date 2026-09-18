import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  _resetErrorLog,
  formatEntry,
  formatErrors,
  getErrors,
  getOutputChannel,
  recordError,
} from "../errorLog";


afterEach(() => {
  _resetErrorLog();
  vi.restoreAllMocks();
});

describe("recordError", () => {
  it("keeps the entry and writes it to the output channel", () => {
    const appendLine = vi.fn();
    vi.spyOn(vscode.window, "createOutputChannel").mockReturnValue({
      appendLine,
      show: () => {},
      dispose: () => {},
    } as never);

    recordError({ at: 0, source: "webview:render", message: "TypeError: x", stack: "at foo" });

    expect(getErrors()).toHaveLength(1);
    expect(appendLine).toHaveBeenCalledWith(expect.stringContaining("[webview:render] TypeError: x"));
  });

  it("caps the log so a repeating crash cannot grow it forever", () => {
    for (let i = 0; i < 60; i++) recordError({ at: i, source: "s", message: `e${i}` });
    const log = getErrors();
    expect(log).toHaveLength(50);
    expect(log[log.length - 1].message).toBe("e59");
  });
});

describe("getOutputChannel", () => {
  it("creates the channel once and reuses it", () => {
    const create = vi.spyOn(vscode.window, "createOutputChannel");
    getOutputChannel();
    getOutputChannel();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("formatEntry", () => {
  it("puts the stack on its own lines under the message", () => {
    const text = formatEntry({ at: 0, source: "window", message: "boom", stack: "at a\nat b" });
    expect(text).toContain("[window] boom");
    expect(text).toContain("at a\nat b");
  });

  it("omits the stack when there isn't one", () => {
    expect(formatEntry({ at: 0, source: "window", message: "boom" })).not.toContain("\n");
  });
});

describe("formatErrors", () => {
  it("says so when nothing failed, rather than returning an empty block", () => {
    expect(formatErrors()).toBe("No errors recorded this session.");
  });

  it("joins the entries newest last", () => {
    recordError({ at: 0, source: "a", message: "first" });
    recordError({ at: 1, source: "b", message: "second" });
    const text = formatErrors();
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });
});
