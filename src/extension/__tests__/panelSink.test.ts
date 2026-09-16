import { describe, expect, it, vi } from "vitest";
import { broadcastSink, type PanelSink } from "../panelSink";

/** A panel that records what it received. */
function fakePanel(result = true): PanelSink & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    postMessage: async (message: unknown) => {
      sent.push(message);
      return result;
    },
  };
}

describe("broadcastSink", () => {
  it("delivers one message to every panel", async () => {
    const a = fakePanel();
    const b = fakePanel();
    await broadcastSink([a, b]).postMessage({ type: "ping" });
    expect(a.sent).toEqual([{ type: "ping" }]);
    expect(b.sent).toEqual([{ type: "ping" }]);
  });

  it("resolves true when at least one panel accepted", async () => {
    const accepted = fakePanel(true);
    const refused = fakePanel(false);
    await expect(broadcastSink([accepted, refused]).postMessage("m")).resolves.toBe(true);
  });

  it("resolves false when every panel refused", async () => {
    await expect(
      broadcastSink([fakePanel(false), fakePanel(false)]).postMessage("m"),
    ).resolves.toBe(false);
  });

  it("resolves false with no panels at all", async () => {
    await expect(broadcastSink([]).postMessage("m")).resolves.toBe(false);
  });

  it("keeps delivering when one panel throws", async () => {
    // Real race: a panel disposed between the visibility check and the
    // post. One dead panel must not silence the other.
    const healthy = fakePanel();
    const dead: PanelSink = {
      postMessage: () => {
        throw new Error("disposed");
      },
    };
    await expect(broadcastSink([dead, healthy]).postMessage("m")).resolves.toBe(true);
    expect(healthy.sent).toEqual(["m"]);
  });

  it("keeps delivering when one panel rejects asynchronously", async () => {
    const healthy = fakePanel();
    const rejecting: PanelSink = { postMessage: () => Promise.reject(new Error("gone")) };
    await expect(broadcastSink([rejecting, healthy]).postMessage("m")).resolves.toBe(true);
    expect(healthy.sent).toEqual(["m"]);
  });

  it("posts to panels concurrently rather than one after another", async () => {
    // A slow panel must not delay the other; serialising here would make
    // every host push as slow as the worst panel.
    let resolveSlow: (v: boolean) => void = () => {};
    const slow: PanelSink = {
      postMessage: () => new Promise<boolean>((r) => (resolveSlow = r)),
    };
    const fast = fakePanel();
    const pending = broadcastSink([slow, fast]).postMessage("m");
    await Promise.resolve();
    expect(fast.sent).toEqual(["m"]);
    resolveSlow(true);
    await expect(pending).resolves.toBe(true);
  });

  it("is structurally satisfied by a vscode.Webview", () => {
    // The whole point of the narrow type: a real Webview is a PanelSink,
    // so the ~86 call sites that post through getWebview() are unchanged.
    const webviewLike = {
      postMessage: vi.fn(async () => true),
      html: "",
      cspSource: "",
      options: {},
      asWebviewUri: (u: unknown) => u,
      onDidReceiveMessage: () => ({ dispose: () => {} }),
    };
    const sink: PanelSink = webviewLike;
    void sink.postMessage("m");
    expect(webviewLike.postMessage).toHaveBeenCalledWith("m");
  });
});
