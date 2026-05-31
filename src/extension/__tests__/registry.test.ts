import { describe, it, expect, beforeEach } from "vitest";
import {
  registerFeature,
  getFeature,
  getFeatures,
  clearRegistry,
  type FeatureContribution,
} from "../registry";

describe("feature registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("registerFeature + getFeature round-trips a contribution", () => {
    const contribution: FeatureContribution = {
      id: "skills",
      parsers: { parseSkill: () => ({ ok: true }) },
    };
    registerFeature(contribution);
    expect(getFeature("skills")).toBe(contribution);
  });

  it("getFeature returns undefined for an unknown id", () => {
    expect(getFeature("missing")).toBeUndefined();
  });

  it("getFeatures returns every registered contribution", () => {
    registerFeature({ id: "skills" });
    registerFeature({ id: "agents" });
    registerFeature({ id: "hooks" });
    const all = getFeatures();
    expect(all.map((f) => f.id).sort()).toEqual(["agents", "hooks", "skills"]);
  });

  it("registering the same id twice replaces the previous contribution", () => {
    const first: FeatureContribution = { id: "skills", parsers: { a: () => 1 } };
    const second: FeatureContribution = { id: "skills", parsers: { b: () => 2 } };
    registerFeature(first);
    registerFeature(second);
    expect(getFeature("skills")).toBe(second);
    expect(getFeatures()).toHaveLength(1);
  });

  it("clearRegistry empties the registry", () => {
    registerFeature({ id: "skills" });
    registerFeature({ id: "agents" });
    clearRegistry();
    expect(getFeatures()).toHaveLength(0);
    expect(getFeature("skills")).toBeUndefined();
  });

  it("invokes a registered onMessage handler", () => {
    let captured: unknown;
    registerFeature({
      id: "skills",
      onMessage: (msg) => {
        captured = msg;
      },
    });
    getFeature("skills")?.onMessage?.({ type: "getSkills" });
    expect(captured).toEqual({ type: "getSkills" });
  });
});
