// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Session, WorktreeRef } from "../../../types";
import { SessionItem, liveTitleForStatus } from "./SessionItem";

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

function session(over: Partial<Session> & { id: string }): Session {
  const base: Session = {
    id: over.id,
    name: "",
    project: "myproj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 0,
    endTime: Date.now(),
    messageCount: 1,
    summary: "the summary",
    prompts: ["do the thing"],
    projectKey: "myproj",
    searchHaystack: "",
  };
  return { ...base, ...over };
}

const noop = () => {};

function renderItem(s: Session, props: Partial<Parameters<typeof SessionItem>[0]> = {}) {
  return render(
    h(SessionItem, {
      session: s,
      isActive: false,
      isPinned: false,
      isSelected: false,
      bulkMode: false,
      hasOpenTerminal: false,
      isTemp: false,
      isDiffProject: false,
      onSelect: noop,
      onResume: noop,
      onView: noop,
      onToggleSelect: noop,
      onContextMenu: noop,
      ...props,
    }),
  );
}

describe("liveTitleForStatus", () => {
  it("maps known statuses", () => {
    expect(liveTitleForStatus("busy")).toBe("Session is busy");
    expect(liveTitleForStatus("idle")).toBe("Session is idle");
    expect(liveTitleForStatus("awaiting_permission")).toBe("Awaiting permission");
    expect(liveTitleForStatus("awaiting_question")).toBe("Awaiting your answer");
  });

  it("falls back to the raw status for unknown values", () => {
    expect(liveTitleForStatus("compacting")).toBe("Session: compacting");
  });

  it("defaults to live for empty / undefined", () => {
    expect(liveTitleForStatus(undefined)).toBe("Session is live");
    expect(liveTitleForStatus("")).toBe("Session is live");
  });
});

describe("SessionItem", () => {
  it("renders the prompt as name when unnamed", () => {
    const { getByText } = renderItem(session({ id: "a" }));
    expect(getByText("do the thing")).toBeTruthy();
  });

  it("shows name and prompt subtitle when named", () => {
    const { container } = renderItem(session({ id: "a", name: "My session" }));
    expect(container.querySelector(".item-name")?.textContent).toBe("My session");
    expect(container.querySelector(".item-prompt")?.textContent).toBe("do the thing");
  });

  it("renders a Temp badge only when isTemp", () => {
    const plain = renderItem(session({ id: "a" }));
    expect(plain.container.querySelector(".tag-temp")).toBeNull();

    const temp = renderItem(session({ id: "b" }), { isTemp: true });
    expect(temp.container.querySelector(".tag-temp")?.textContent).toBe("Temp");
  });

  it("renders a live dot with status when live", () => {
    const { container } = renderItem(session({ id: "a", isLive: true, status: "busy" }));
    const dot = container.querySelector(".live-dot");
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("data-status")).toBe("busy");
    expect(dot?.getAttribute("title")).toBe("Session is busy");
  });

  it("gives the live dot an accessible name (colour-only status must reach screen readers)", () => {
    const { container } = renderItem(session({ id: "a", isLive: true, status: "busy" }));
    const dot = container.querySelector(".live-dot");
    expect(dot?.getAttribute("aria-label")).toBe("Session is busy");
    expect(dot?.getAttribute("aria-hidden")).toBeNull();
  });

  it("omits the live dot when not live", () => {
    const { container } = renderItem(session({ id: "a", isLive: false }));
    expect(container.querySelector(".live-dot")).toBeNull();
  });

  it("hides the HEAD branch tag", () => {
    const { container } = renderItem(session({ id: "a", branch: "HEAD" }));
    expect(container.querySelector(".item-row2 .tag")).toBeNull();
  });

  it("shows a real branch tag", () => {
    const { container } = renderItem(session({ id: "a", branch: "feature/x" }));
    expect(container.querySelector(".tag")?.textContent).toBe("feature/x");
  });

  it("shows the pin icon when pinned", () => {
    const { container } = renderItem(session({ id: "a" }), { isPinned: true });
    expect(container.querySelector(".pin-icon")).toBeTruthy();
  });

  it("invokes onSelect on row click in normal mode", () => {
    const onSelect = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { onSelect });
    fireEvent.click(container.querySelector(".session-item") as Element);
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("opens on Enter / Space (row is keyboard-operable)", () => {
    const onSelect = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { onSelect });
    const row = container.querySelector(".session-item") as HTMLElement;
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("Enter/Space on the inline resume button does not also select the row", () => {
    const onSelect = vi.fn();
    const onResume = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { onSelect, onResume });
    fireEvent.keyDown(container.querySelector(".item-resume") as Element, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("invokes onResume on the resume button click, not onSelect", () => {
    const onSelect = vi.fn();
    const onResume = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { onSelect, onResume });
    fireEvent.click(container.querySelector(".item-resume") as Element);
    expect(onResume).toHaveBeenCalledWith("a");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers View (not Resume) for a live session with no tracked terminal", () => {
    const onResume = vi.fn();
    const onView = vi.fn();
    const { container } = renderItem(session({ id: "a", isLive: true, status: "idle" }), {
      hasOpenTerminal: false,
      onResume,
      onView,
    });
    const btn = container.querySelector(".item-resume") as HTMLButtonElement;
    expect(btn.getAttribute("title")).toBe("Session is running — reveal its terminal");
    fireEvent.click(btn);
    expect(onView).toHaveBeenCalledWith("a");
    expect(onResume).not.toHaveBeenCalled();
  });

  it("offers Resume (play) only for a session that is neither live nor terminal-backed", () => {
    const onResume = vi.fn();
    const { container } = renderItem(session({ id: "a", isLive: false }), {
      hasOpenTerminal: false,
      onResume,
    });
    const btn = container.querySelector(".item-resume") as HTMLButtonElement;
    expect(btn.getAttribute("title")).toBe("Resume session");
    fireEvent.click(btn);
    expect(onResume).toHaveBeenCalledWith("a");
  });

  it("toggles selection instead of selecting in bulk mode", () => {
    const onSelect = vi.fn();
    const onToggleSelect = vi.fn();
    const { container } = renderItem(session({ id: "a" }), {
      bulkMode: true,
      onSelect,
      onToggleSelect,
    });
    fireEvent.click(container.querySelector(".session-item") as Element);
    expect(onToggleSelect).toHaveBeenCalledWith("a", false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hides the resume button in bulk mode", () => {
    const { container } = renderItem(session({ id: "a" }), { bulkMode: true });
    expect(container.querySelector(".item-resume")).toBeNull();
  });

  it("hides the resume button for a session from a different project (detail view offers 'Open project' instead)", () => {
    const { container } = renderItem(session({ id: "a" }), { isDiffProject: true });
    expect(container.querySelector(".item-resume")).toBeNull();
  });

  it("still shows the open-terminal button for a different-project session with an open terminal", () => {
    const { container } = renderItem(session({ id: "a" }), {
      isDiffProject: true,
      hasOpenTerminal: true,
    });
    expect(container.querySelector(".item-resume")).toBeTruthy();
  });

  it("opens the action menu on right-click at the cursor without selecting the row", () => {
    const onSelect = vi.fn();
    const onContextMenu = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { onSelect, onContextMenu });
    const row = container.querySelector(".session-item") as Element;
    fireEvent.contextMenu(row, { clientX: 40, clientY: 80 });
    expect(onContextMenu).toHaveBeenCalledWith("a", 40, 80);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not render a ⋯ overflow trigger — right-click is the single menu path", () => {
    const { container } = renderItem(session({ id: "a" }));
    expect(container.querySelector(".item-menu-btn")).toBeNull();
  });

  it("suppresses right-click menu in bulk mode", () => {
    const onContextMenu = vi.fn();
    const { container } = renderItem(session({ id: "a" }), { bulkMode: true, onContextMenu });
    fireEvent.contextMenu(container.querySelector(".session-item") as Element);
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  describe("worktree badge", () => {
    it("renders a Claude worktree badge with the bot icon, short name and branch", () => {
      const { container } = renderItem(session({ id: "a" }), {
        worktree: ref({ path: "/repo/.claude/worktrees/feat", branch: "worktree-feat", kind: "claude" }),
      });
      const badge = container.querySelector(".tag-wt");
      expect(badge).toBeTruthy();
      expect(badge?.classList.contains("tag-wt--claude")).toBe(true);
      expect(badge?.querySelector("[data-icon='bot']")).toBeTruthy();
      expect(container.querySelector(".tag-wt__name")?.textContent).toBe("feat");
      expect(container.querySelector(".tag-wt__branch")?.textContent).toBe("worktree-feat");
    });

    it("renders a user worktree badge with the branch icon", () => {
      const { container } = renderItem(session({ id: "a" }), {
        worktree: ref({ path: "/repo/wt/mine", kind: "user" }),
      });
      const badge = container.querySelector(".tag-wt");
      expect(badge?.classList.contains("tag-wt--user")).toBe(true);
      expect(badge?.querySelector("[data-icon='git-branch']")).toBeTruthy();
      expect(container.querySelector(".tag-wt__name")?.textContent).toBe("mine");
    });

    it("suppresses the plain branch tag when a worktree badge is shown (no duplicate branch)", () => {
      const { container } = renderItem(session({ id: "a", branch: "worktree-feat" }), {
        worktree: ref({ branch: "worktree-feat" }),
      });
      // The only .tag in row2 is the worktree badge itself.
      const tags = container.querySelectorAll(".item-row2 .tag");
      expect(tags).toHaveLength(1);
      expect(tags[0].classList.contains("tag-wt")).toBe(true);
    });

    it("shows no badge for a main-checkout ref (keeps the plain branch tag)", () => {
      const { container } = renderItem(session({ id: "a", branch: "main" }), {
        worktree: ref({ kind: "main", branch: "main" }),
      });
      expect(container.querySelector(".tag-wt")).toBeNull();
      expect(container.querySelector(".item-row2 .tag")?.textContent).toBe("main");
    });

    it("shows no badge when the session is not in a worktree", () => {
      const { container } = renderItem(session({ id: "a" }));
      expect(container.querySelector(".tag-wt")).toBeNull();
    });

    it("marks a removed worktree with the missing modifier", () => {
      const { container } = renderItem(session({ id: "a" }), {
        worktree: ref({ exists: false }),
      });
      expect(container.querySelector(".tag-wt")?.classList.contains("tag-wt--missing")).toBe(true);
    });

    it("flags a locked (in-use) worktree", () => {
      const { container } = renderItem(session({ id: "a" }), {
        worktree: ref({ locked: true }),
      });
      const badge = container.querySelector(".tag-wt");
      expect(badge?.classList.contains("tag-wt--locked")).toBe(true);
      expect(badge?.getAttribute("title")).toContain("in active use");
    });
  });
});
