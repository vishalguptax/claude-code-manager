import { describe, expect, it, vi } from "vitest";
import { postAccountData } from "../accountPush";
import type { AccountData } from "../../account/types";

/** Minimal fake Webview capturing postMessage calls. */
function fakeWebview(): { postMessage: ReturnType<typeof vi.fn> } {
  return { postMessage: vi.fn() };
}

const DATA_A = { profile: { email: "a@x.com" } } as unknown as AccountData;
const DATA_B = { profile: { email: "b@x.com" } } as unknown as AccountData;

describe("postAccountData", () => {
  it("always delivers a solicited push (dedupe off) even when the body is unchanged", () => {
    // This is the regression: Account tab requests → gets DATA_A. Config
    // tab later requests the SAME data → must still receive it, or its
    // skeleton stays stuck. A request response is never deduped.
    const wv = fakeWebview();
    postAccountData(wv as never, DATA_A); // Account's reply
    postAccountData(wv as never, DATA_A); // Config's reply — same body
    expect(wv.postMessage).toHaveBeenCalledTimes(2);
  });

  it("dedupes an unsolicited watcher push whose body is unchanged", () => {
    const wv = fakeWebview();
    postAccountData(wv as never, DATA_A, true);
    postAccountData(wv as never, DATA_A, true); // identical — dropped
    expect(wv.postMessage).toHaveBeenCalledTimes(1);
  });

  it("delivers a watcher push when the body changed", () => {
    const wv = fakeWebview();
    postAccountData(wv as never, DATA_A, true);
    postAccountData(wv as never, DATA_B, true);
    expect(wv.postMessage).toHaveBeenCalledTimes(2);
  });

  it("a solicited push updates the baseline, so a following identical watcher push dedupes", () => {
    const wv = fakeWebview();
    postAccountData(wv as never, DATA_A); // solicited — sent, baseline = A
    postAccountData(wv as never, DATA_A, true); // watcher, same — dropped
    expect(wv.postMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps dedupe state per webview (a remount with a new webview always receives)", () => {
    const wv1 = fakeWebview();
    const wv2 = fakeWebview();
    postAccountData(wv1 as never, DATA_A, true);
    postAccountData(wv2 as never, DATA_A, true); // different webview — sent
    expect(wv1.postMessage).toHaveBeenCalledTimes(1);
    expect(wv2.postMessage).toHaveBeenCalledTimes(1);
  });
});
