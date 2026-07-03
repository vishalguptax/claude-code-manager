import { describe, it, expect, beforeEach } from "vitest";
import type { Hook } from "../../../types";
import {
  countByScope,
  filteredHooks,
  groupedHooks,
  hooks,
  parseErrors,
  scopeFilter,
  searchQuery,
  selectedHook,
  setError,
  setHooks,
  resetHooksState,
  errorMessage,
  loading,
} from "../signals";

function hook(partial: Partial<Hook>): Hook {
  return {
    event: "PreToolUse",
    matcher: "Write",
    command: "echo hi",
    scope: "global",
    disabled: false,
    hookType: "command",
    entryIndex: 0,
    commandIndex: null,
    ...partial,
  };
}

beforeEach(() => {
  resetHooksState();
});

describe("hooks signals", () => {
  it("setHooks replaces the list, clears loading + error", () => {
    setError("boom");
    expect(errorMessage.value).toBe("boom");
    setHooks([hook({})]);
    expect(hooks.value).toHaveLength(1);
    expect(loading.value).toBe(false);
    expect(errorMessage.value).toBeNull();
  });

  it("countByScope counts only the requested scope", () => {
    setHooks([
      hook({ scope: "global" }),
      hook({ scope: "global", command: "b" }),
      hook({ scope: "project", command: "c" }),
    ]);
    expect(countByScope("global")).toBe(2);
    expect(countByScope("project")).toBe(1);
    expect(countByScope("local")).toBe(0);
  });

  it("filteredHooks applies the scope filter", () => {
    setHooks([hook({ scope: "global" }), hook({ scope: "local", command: "z" })]);
    scopeFilter.value = "local";
    expect(filteredHooks.value).toHaveLength(1);
    expect(filteredHooks.value[0]?.command).toBe("z");
  });

  it("filteredHooks matches the query against event, matcher and command", () => {
    setHooks([
      hook({ event: "PreToolUse", matcher: "Write", command: "alpha" }),
      hook({ event: "Stop", matcher: "Bash", command: "beta" }),
    ]);
    searchQuery.value = "bash";
    expect(filteredHooks.value).toHaveLength(1);
    expect(filteredHooks.value[0]?.command).toBe("beta");
    searchQuery.value = "alpha";
    expect(filteredHooks.value).toHaveLength(1);
    searchQuery.value = "stop";
    expect(filteredHooks.value[0]?.event).toBe("Stop");
  });

  it("groupedHooks groups filtered hooks by event preserving order", () => {
    setHooks([
      hook({ event: "PreToolUse", command: "a" }),
      hook({ event: "Stop", command: "b" }),
      hook({ event: "PreToolUse", command: "c" }),
    ]);
    const groups = groupedHooks.value;
    expect(groups.map(([e]) => e)).toEqual(["PreToolUse", "Stop"]);
    expect(groups[0]?.[1]).toHaveLength(2);
  });

  it("setHooks follows an edited hook in the same array slot", () => {
    const original = hook({ command: "old" });
    setHooks([original]);
    selectedHook.value = original;
    // Identity is positional (scope/event/disabled/entryIndex/commandIndex),
    // not command text — so editing a hook's command keeps the detail view
    // open on it, showing the new value, instead of dropping the selection.
    setHooks([hook({ command: "new" })]);
    expect(selectedHook.value?.command).toBe("new");
  });

  it("setHooks drops the selection when the hook is no longer present", () => {
    const original = hook({ command: "old" });
    setHooks([original]);
    selectedHook.value = original;
    setHooks([]);
    expect(selectedHook.value).toBeNull();
  });

  it("setError records the message and stops loading", () => {
    setError("nope");
    expect(errorMessage.value).toBe("nope");
    expect(loading.value).toBe(false);
  });

  it("setHooks records parse errors alongside the list, defaulting to none", () => {
    setHooks([hook({})], ["Failed to parse .claude/settings.json: bad"]);
    expect(parseErrors.value).toEqual(["Failed to parse .claude/settings.json: bad"]);
    setHooks([hook({})]);
    expect(parseErrors.value).toEqual([]);
  });

  it("resetHooksState clears parse errors", () => {
    setHooks([hook({})], ["boom"]);
    resetHooksState();
    expect(parseErrors.value).toEqual([]);
  });
});
