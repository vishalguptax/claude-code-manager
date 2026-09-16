/**
 * Tests for the memory tab's host senders.
 *
 * The contract that matters: the webview names a project and a filename and
 * never an absolute path, so the host's traversal guard is the only thing
 * that turns a pair into a path. A refactor that "simplified" these to send
 * `memory.path` would silently widen what a compromised webview can reach.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryApi } from "../api";

function harness() {
  const post = vi.fn();
  return { post, api: createMemoryApi(post) };
}

describe("createMemoryApi", () => {
  it("asks for the store with no payload", () => {
    const { api, post } = harness();
    api.getMemories();
    expect(post).toHaveBeenCalledWith({ type: "getMemories" });
  });

  it("sends the project and filename for open, reveal and delete", () => {
    const { api, post } = harness();
    api.open("-p-one", "alpha.md");
    api.reveal("-p-one", "alpha.md");
    api.remove("-p-one", "alpha.md");
    expect(post.mock.calls.map(([m]) => m)).toEqual([
      { type: "openMemory", project: "-p-one", fileName: "alpha.md" },
      { type: "revealMemory", project: "-p-one", fileName: "alpha.md" },
      { type: "deleteMemory", project: "-p-one", fileName: "alpha.md" },
    ]);
  });

  it("never puts an absolute path on the wire", () => {
    const { api, post } = harness();
    api.open("-p-one", "alpha.md");
    api.remove("-p-one", "alpha.md");
    for (const [msg] of post.mock.calls) {
      expect(JSON.stringify(msg)).not.toContain("/");
    }
  });
});
