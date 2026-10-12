import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../../../../webview/shared/hooks", () => ({
  useApi: () => ({ post }),
  setVscodeApi: () => {},
}));

import { applySearchQuery } from "./search";
import {
  _resetSessionsSignals,
  fullTextLoadingSignal,
  fullTextSignal,
  searchQuerySignal,
} from "./signals";

beforeEach(() => {
  _resetSessionsSignals();
  post.mockClear();
});

describe("applySearchQuery", () => {
  it("stores the trimmed, lowercased query and asks the host to scan transcripts", () => {
    applySearchQuery("  Token Refresh ");
    expect(searchQuerySignal.value).toBe("token refresh");
    expect(fullTextLoadingSignal.value).toBe(true);
    expect(post).toHaveBeenCalledWith({ type: "searchFullText", query: "token refresh" });
  });

  it("skips the transcript scan for a query too short to be useful", () => {
    applySearchQuery("a");
    expect(searchQuerySignal.value).toBe("a");
    expect(post).not.toHaveBeenCalled();
  });

  it("clears earlier transcript hits when the query is cleared", () => {
    fullTextSignal.value = { query: "old", ids: new Set(["x"]) };
    applySearchQuery("");
    expect(searchQuerySignal.value).toBe("");
    expect(fullTextSignal.value.ids.size).toBe(0);
    expect(fullTextLoadingSignal.value).toBe(false);
  });
});
