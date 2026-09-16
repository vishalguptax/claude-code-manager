import { describe, expect, it } from "vitest";
import { moveTab, toggleHiddenTab } from "../tabPrefs";

describe("moveTab", () => {
  const order = ["sessions", "skills", "mcp", "account", "config"];

  it("moves an id down past a neighbour", () => {
    expect(moveTab(order, 0, 1)).toEqual(["skills", "sessions", "mcp", "account", "config"]);
  });

  it("moves an id up past a neighbour", () => {
    expect(moveTab(order, 3, 2)).toEqual(["sessions", "skills", "account", "mcp", "config"]);
  });

  it("moves an id to the very front", () => {
    expect(moveTab(order, 3, 0)).toEqual(["account", "sessions", "skills", "mcp", "config"]);
  });

  it("moves an id to the very back", () => {
    expect(moveTab(order, 1, 4)).toEqual(["sessions", "mcp", "account", "config", "skills"]);
  });

  it("is a no-op moving an item to its own position", () => {
    expect(moveTab(order, 2, 2)).toEqual(order);
  });

  it("clamps a target past the end instead of dropping the item", () => {
    // A caller doing `index + 1` on the last row must not have to
    // special-case it — the row simply stays put.
    expect(moveTab(order, 4, 99)).toEqual(order);
  });

  it("clamps a target before the start instead of throwing", () => {
    expect(moveTab(order, 0, -5)).toEqual(order);
  });

  it("is a no-op for an out-of-range source index", () => {
    expect(moveTab(order, 99, 0)).toEqual(order);
    expect(moveTab(order, -1, 0)).toEqual(order);
  });

  it("never mutates the input array", () => {
    const before = [...order];
    moveTab(order, 0, 4);
    expect(order).toEqual(before);
  });
});

describe("toggleHiddenTab", () => {
  it("adds an id that is not yet hidden", () => {
    expect(toggleHiddenTab([], "skills")).toEqual(["skills"]);
    expect(toggleHiddenTab(["mcp"], "skills")).toEqual(["mcp", "skills"]);
  });

  it("removes an id that is already hidden", () => {
    expect(toggleHiddenTab(["mcp", "skills"], "mcp")).toEqual(["skills"]);
  });

  it("never mutates the input array", () => {
    const before = ["mcp"];
    const beforeCopy = [...before];
    toggleHiddenTab(before, "skills");
    expect(before).toEqual(beforeCopy);
  });
});
