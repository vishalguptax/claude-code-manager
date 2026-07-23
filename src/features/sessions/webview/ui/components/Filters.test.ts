// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Session, WorktreeRef } from "../../../types";
import { Filters } from "./Filters";
import {
  filterProjectSignal,
  filterWorktreeSignal,
  sessionsSignal,
  worktreesSignal,
  _resetSessionsSignals,
} from "../../model";

// Filters' api senders post through the shared bridge; stub it so nothing
// throws when a control fires.
vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post: () => {} }),
  setVscodeApi: () => {},
}));

function session(over: Partial<Session> & { id: string }): Session {
  const base: Session = {
    id: over.id,
    name: "",
    project: "proj",
    projectPath: "/repo/proj",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: 0,
    messageCount: 1,
    summary: "",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
  };
  return { ...base, ...over };
}

function ref(over: Partial<WorktreeRef> = {}): WorktreeRef {
  return {
    path: "/repo/.claude/worktrees/feat",
    branch: "worktree-feat",
    kind: "claude",
    exists: true,
    locked: false,
    repoRoot: "/repo",
    ...over,
  };
}

describe("Filters — worktree dropdown", () => {
  beforeEach(() => {
    _resetSessionsSignals();
    filterProjectSignal.value = "all";
  });

  it("is hidden when no Claude/user worktree sessions are present", () => {
    sessionsSignal.value = [session({ id: "a" })];
    const { container } = render(h(Filters, {}));
    expect(container.querySelector("[aria-label='Filter by worktree']")).toBeNull();
  });

  it("appears once a worktree session exists and drives the worktree filter signal", () => {
    sessionsSignal.value = [session({ id: "a" })];
    worktreesSignal.value = { a: ref({ kind: "claude" }) };
    const { container } = render(h(Filters, {}));
    const trigger = container.querySelector(
      "[aria-label='Filter by worktree']",
    ) as HTMLButtonElement;
    expect(trigger).toBeTruthy();

    // Open the dropdown and pick "Claude worktrees".
    fireEvent.click(trigger);
    const option = [...document.querySelectorAll(".vsc-menu-item, .ctx-item")].find((el) =>
      el.textContent?.includes("Claude worktrees"),
    ) as HTMLElement | undefined;
    expect(option).toBeTruthy();
    fireEvent.click(option as HTMLElement);
    expect(filterWorktreeSignal.value).toBe("claude");
  });
});
