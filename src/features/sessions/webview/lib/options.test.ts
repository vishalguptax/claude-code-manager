import { describe, expect, it } from "vitest";
import type { Session } from "../../types";
import {
  buildBranchOptions,
  buildProjectOptions,
  listBranches,
  orderProjects,
} from "./options";

function session(over: Partial<Session> & { id: string }): Session {
  const base: Session = {
    id: over.id,
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 1000,
    endTime: 1000,
    messageCount: 1,
    summary: "summary",
    prompts: ["first prompt"],
    projectKey: "proj",
    searchHaystack: "",
  };
  return { ...base, ...over };
}

const NONE = new Set<string>();

describe("orderProjects", () => {
  it("orders projects with current first then by activity", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 10 }),
      session({ id: "b", project: "beta", projectKey: "beta", endTime: 99 }),
    ];
    expect(orderProjects(sessions, NONE, "alpha")).toEqual(["alpha", "beta"]);
  });

  it("falls back to activity ordering when no current project", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 10 }),
      session({ id: "b", project: "beta", projectKey: "beta", endTime: 99 }),
    ];
    expect(orderProjects(sessions, NONE, "")).toEqual(["beta", "alpha"]);
  });
});

describe("listBranches", () => {
  it("lists distinct branches with (no branch) last", () => {
    const sessions = [
      session({ id: "a", branch: "main" }),
      session({ id: "b", branch: "" }),
      session({ id: "c", branch: "dev" }),
    ];
    expect(listBranches(sessions, NONE)).toEqual(["dev", "main", "(no branch)"]);
  });

  it("excludes deleted sessions", () => {
    const sessions = [session({ id: "a", branch: "main" }), session({ id: "b", branch: "dev" })];
    expect(listBranches(sessions, new Set(["b"]))).toEqual(["main"]);
  });
});

describe("buildProjectOptions", () => {
  it("leads with the two scopes and tallies per-project counts", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", endTime: 100 }),
      session({ id: "b", project: "alpha", projectKey: "alpha", endTime: 200 }),
      session({ id: "c", project: "beta", projectKey: "beta", endTime: 300 }),
    ];
    const opts = buildProjectOptions(sessions, NONE, "alpha");
    expect(opts[0]).toMatchObject({ value: "current", count: 2 });
    expect(opts[1]).toMatchObject({ value: "all", count: 3 });
    expect(opts.find((o) => o.value === "alpha")?.count).toBe(2);
  });

  it("excludes deleted sessions from every count", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha" }),
      session({ id: "b", project: "alpha", projectKey: "alpha" }),
    ];
    const all = buildProjectOptions(sessions, new Set(["b"]), "").find((o) => o.value === "all");
    expect(all?.count).toBe(1);
  });
});

describe("buildBranchOptions", () => {
  it("leads with All Branches, scopes counts, and marks the current branch", () => {
    const sessions = [
      session({ id: "a", branch: "main", endTime: 100 }),
      session({ id: "b", branch: "main", endTime: 200 }),
      session({ id: "c", branch: "dev", endTime: 300 }),
    ];
    const opts = buildBranchOptions(sessions, NONE, "main", "all", "");
    expect(opts[0]).toMatchObject({ value: "all", count: 3 });
    expect(opts[1]).toMatchObject({ value: "main", count: 2, isCurrent: true });
    expect(opts.find((o) => o.value === "dev")?.isCurrent).toBe(false);
  });

  it("buckets empty branches under (no branch)", () => {
    const sessions = [session({ id: "a", branch: "" })];
    const opts = buildBranchOptions(sessions, NONE, "", "all", "");
    expect(opts.some((o) => o.value === "(no branch)")).toBe(true);
  });

  it("scopes counts to the active project filter", () => {
    const sessions = [
      session({ id: "a", project: "alpha", projectKey: "alpha", branch: "main" }),
      session({ id: "b", project: "beta", projectKey: "beta", branch: "dev" }),
    ];
    const opts = buildBranchOptions(sessions, NONE, "", "alpha", "");
    expect(opts[0]).toMatchObject({ value: "all", count: 1 });
    expect(opts.some((o) => o.value === "dev")).toBe(false);
  });
});
