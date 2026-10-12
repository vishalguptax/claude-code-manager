// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/preact";
import { h } from "preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../shared/protocol/messages";
import { initPersistence } from "../../../webview/persistence";
import { setVscodeApi } from "../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../webview/shared/model";
import { SessionsExplorer } from "./explorer";
import {
  _resetExplorer,
  _resetSessionsSignals,
  explorerViewModeSignal,
  folderNamesSignal,
  selectedIdSignal,
  viewSignal,
} from "./model";

const post = vi.fn();

beforeEach(() => {
  _resetMessageBus();
  _resetSessionsSignals();
  _resetExplorer();
  post.mockReset();
  setVscodeApi({ postMessage: post });
});
afterEach(() => {
  cleanup();
  setVscodeApi(null);
});

describe("SessionsExplorer", () => {
  it("asks the host for the initial data", () => {
    render(h(SessionsExplorer, {}));
    expect(post).toHaveBeenCalledWith({ type: "ready" });
  });

  it("applies host pushes, folders included", () => {
    render(h(SessionsExplorer, {}));
    dispatch({ type: "userState", folderNames: ["zeta", "Alpha"] } as Message);
    expect(folderNamesSignal.value).toEqual(["Alpha", "zeta"]);
  });

  it("keeps its preview when a delete elsewhere sends navigateList", () => {
    render(h(SessionsExplorer, {}));
    selectedIdSignal.value = "a";
    dispatch({ type: "navigateList" } as Message);
    expect(selectedIdSignal.value).toBe("a");
    expect(viewSignal.value).toBe("list");
  });

  it("restores the saved layout", () => {
    initPersistence({ postMessage: () => {}, getState: () => ({ "explorer.viewMode": "tiles" }), setState: () => {} });
    render(h(SessionsExplorer, {}));
    expect(explorerViewModeSignal.value).toBe("tiles");
  });
});
