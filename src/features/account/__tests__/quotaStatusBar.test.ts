import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { QuotaResult, QuotaWindow } from "../quota";

const state = vi.hoisted(() => ({
  result: null as unknown as QuotaResult,
  accountUuid: "acct-a",
}));

vi.mock("../quota", () => ({ readQuota: () => state.result }));
vi.mock("../claudeJsonCache", () => ({
  readClaudeJsonParsed: () => ({ oauthAccount: { accountUuid: state.accountUuid } }),
}));

import { describeQuotaStatus, startQuotaStatusBar } from "../quotaStatusBar";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const HOUR = 3_600_000;

/** A success read shaped as ./quota returns it from a real tap cache. */
function success(
  fiveHour: QuotaWindow | null,
  sevenDay: QuotaWindow | null,
  capturedAt = new Date(NOW - 60_000).toISOString(),
): QuotaResult {
  return {
    ok: true,
    data: {
      quota: { fiveHour, sevenDay, spendLimit: null, capturedAt, fetchedAt: capturedAt },
      live: {
        model: "Opus 4.6",
        contextUsedPercent: 3,
        contextSize: 1_000_000,
        contextTokens: null,
        sessionCostUsd: 0.97,
        linesAdded: 1,
        linesRemoved: 2,
        version: "2.1.86",
        capturedAt,
        sessionName: "",
        promptCache: null,
        pr: null,
        worktree: null,
        repo: null,
      },
    },
  };
}

const future = (hours: number): string => new Date(NOW + hours * HOUR).toISOString();
const win = (utilization: number, resetsAt = future(2)): QuotaWindow => ({
  utilization,
  resetsAt,
});

describe("describeQuotaStatus", () => {
  it("keeps the plain label when the tap is not installed or has no data", () => {
    const status = describeQuotaStatus(
      { ok: false, error: { kind: "not-installed", message: "" } },
      NOW,
      0,
    );
    expect(status.text).toBe("$(sparkle) Claude Code Manager");
    expect(status.severity).toBe("normal");
  });

  it("keeps the plain label when the render carried no rate-limit windows", () => {
    expect(describeQuotaStatus(success(null, null), NOW, 0).text).toBe(
      "$(sparkle) Claude Code Manager",
    );
  });

  it("shows both windows, rounded, with their reset times in the tooltip", () => {
    const status = describeQuotaStatus(success(win(41.6), win(40, future(72))), NOW, 0);
    expect(status.text).toBe("$(sparkle) 5h 42% · 7d 40%");
    expect(status.severity).toBe("normal");
    expect(status.tooltip).toMatch(/^5-hour window: 42% used · resets /);
    expect(status.tooltip).toMatch(/7-day window: 40% used · resets /);
    expect(status.tooltip).toMatch(/As of Claude Code's last render at /);
  });

  it("shows only the window Claude reported", () => {
    expect(describeQuotaStatus(success(null, win(12)), NOW, 0).text).toBe("$(sparkle) 7d 12%");
  });

  it("tints amber from 75% and red from 90%, pointing at claude.ai's reset", () => {
    expect(describeQuotaStatus(success(win(74), win(10)), NOW, 0).severity).toBe("normal");
    expect(describeQuotaStatus(success(win(75), win(10)), NOW, 0).severity).toBe("warning");
    const critical = describeQuotaStatus(success(win(20), win(90)), NOW, 0);
    expect(critical.severity).toBe("critical");
    expect(critical.tooltip).toMatch(/free limit reset at claude\.ai/);
  });

  it("stops claiming a window's figure once its reset time has passed", () => {
    const status = describeQuotaStatus(
      success(win(100, new Date(NOW - HOUR).toISOString()), win(40)),
      NOW,
      0,
    );
    expect(status.text).toBe("$(sparkle) 5h reset · 7d 40%");
    // The void 100% must not keep the item red.
    expect(status.severity).toBe("normal");
    expect(status.tooltip).toMatch(/5-hour window: reset since the last reading/);
  });

  it("omits the reset clause when Claude did not report a reset time", () => {
    const status = describeQuotaStatus(success(win(30, ""), null), NOW, 0);
    expect(status.tooltip).toMatch(/^5-hour window: 30% used\n/);
  });

  it("hides a capture taken before the account switch", () => {
    const status = describeQuotaStatus(success(win(95), win(40)), NOW, NOW - 1_000);
    expect(status.text).toBe("$(sparkle) Claude Code Manager");
    expect(status.severity).toBe("normal");
    expect(status.tooltip).toMatch(/Switched account/);
  });

  it("shows a capture taken after the account switch", () => {
    const status = describeQuotaStatus(success(win(50), null), NOW, NOW - 5 * 60_000);
    expect(status.text).toBe("$(sparkle) 5h 50%");
  });
});

describe("startQuotaStatusBar", () => {
  type Item = {
    text: string;
    tooltip: string;
    command: string;
    backgroundColor: vscode.ThemeColor | undefined;
    show: () => void;
    dispose: () => void;
  };
  let item: Item;
  let subscriptions: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    state.accountUuid = "acct-a";
    item = {
      text: "",
      tooltip: "",
      command: "",
      backgroundColor: undefined,
      show: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(vscode.window, "createStatusBarItem").mockReturnValue(
      item as unknown as vscode.StatusBarItem,
    );
    subscriptions = [];
  });

  afterEach(() => {
    for (const s of subscriptions) (s as { dispose: () => void }).dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const start = (): void =>
    startQuotaStatusBar({ subscriptions } as unknown as vscode.ExtensionContext);

  it("renders the current quota on start, opens the sidebar on click, and tints red", () => {
    state.result = success(win(93), win(40));
    start();
    expect(item.text).toBe("$(sparkle) 5h 93% · 7d 40%");
    expect(item.command).toBe("claudeManager.open");
    expect(item.backgroundColor).toEqual(new vscode.ThemeColor("statusBarItem.errorBackground"));
    expect(item.show).toHaveBeenCalled();
  });

  it("re-evaluates on its own so a passed reset time clears the figure", () => {
    state.result = success(win(100, future(0.5)), null);
    start();
    expect(item.text).toBe("$(sparkle) 5h 100%");
    vi.advanceTimersByTime(HOUR);
    expect(item.text).toBe("$(sparkle) 5h reset");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("drops the previous account's figures after a switch until a new render", () => {
    state.result = success(win(80), null, new Date(NOW - 60_000).toISOString());
    start();
    expect(item.text).toBe("$(sparkle) 5h 80%");
    state.accountUuid = "acct-b";
    vi.advanceTimersByTime(60_000);
    expect(item.text).toBe("$(sparkle) Claude Code Manager");
    state.result = success(win(10), null, new Date(Date.now()).toISOString());
    vi.advanceTimersByTime(60_000);
    expect(item.text).toBe("$(sparkle) 5h 10%");
  });

  it("stops re-evaluating once disposed", () => {
    state.result = success(win(10), null);
    start();
    for (const s of subscriptions) (s as { dispose: () => void }).dispose();
    subscriptions = [];
    state.result = success(win(60), null);
    vi.advanceTimersByTime(5 * 60_000);
    expect(item.text).toBe("$(sparkle) 5h 10%");
  });
});
