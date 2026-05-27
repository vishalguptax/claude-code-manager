// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { beforeEach, describe, expect, it } from "vitest";
import type { QuotaSuccess } from "../../../quota";
import { _resetAccountState, setQuotaError, setQuotaSuccess } from "../../model";
import { LiveView } from "./LiveView";

function success(live: Partial<QuotaSuccess["live"]>): QuotaSuccess {
  return {
    quota: {
      fiveHour: null,
      sevenDay: null,
      capturedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
    },
    live: {
      model: "Opus 4.6 (1M context)",
      contextUsedPercent: 3,
      contextSize: 1_000_000,
      sessionCostUsd: 0.97,
      linesAdded: 214,
      linesRemoved: 179,
      version: "2.1.86",
      capturedAt: new Date().toISOString(),
      ...live,
    },
  };
}

describe("LiveView", () => {
  beforeEach(() => _resetAccountState());

  it("renders nothing when quota isn't loaded", () => {
    const { container } = render(h(LiveView, {}));
    expect(container.textContent).toBe("");
  });

  it("renders nothing on an error state", () => {
    setQuotaError({ kind: "not-installed", message: "x" });
    const { container } = render(h(LiveView, {}));
    expect(container.textContent).toBe("");
  });

  it("shows model, context, cost and edits when data is present", () => {
    setQuotaSuccess(success({}));
    render(h(LiveView, {}));
    expect(screen.getByText("Current session")).toBeTruthy();
    expect(screen.getByText("Opus 4.6 (1M context)")).toBeTruthy();
    expect(screen.getByText("3% of 1.0M")).toBeTruthy();
    expect(screen.getByText("$0.97")).toBeTruthy();
    expect(screen.getByText("+214 / −179")).toBeTruthy();
  });

  it("hides itself when the session carries no metrics", () => {
    setQuotaSuccess(
      success({ model: "", contextUsedPercent: null, sessionCostUsd: null, linesAdded: null, linesRemoved: null }),
    );
    const { container } = render(h(LiveView, {}));
    expect(container.textContent).toBe("");
  });
});
