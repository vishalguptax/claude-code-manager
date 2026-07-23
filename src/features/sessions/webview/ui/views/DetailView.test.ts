// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { act, fireEvent, render } from "@testing-library/preact";
import type { Message, SessionDetail, WorktreeRef } from "../../../types";
import { DetailView } from "./DetailView";
import {
  currentProjectSignal,
  detailLoadingSignal,
  detailSignal,
  worktreesSignal,
  _resetSessionsSignals,
} from "../../model";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../../../../../webview/shared/hooks", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../webview/shared/hooks")>()),
  useApi: () => ({ post }),
  setVscodeApi: () => {},
}));

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

function msg(over: Partial<Message>): Message {
  return { role: "user", content: "c", timestamp: "", ...over };
}

function detail(over: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "a",
    name: "My session",
    project: "proj",
    projectPath: "/p",
    branch: "main",
    entrypoint: "cli",
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_300_000,
    messageCount: 2,
    summary: "the summary",
    prompts: [],
    projectKey: "proj",
    searchHaystack: "",
    messages: [msg({ content: "first" }), msg({ role: "assistant", content: "second" })],
    totalMessages: 2,
    detailMode: "last",
    ...over,
  };
}

describe("DetailView", () => {
  beforeEach(() => {
    _resetSessionsSignals();
    post.mockClear();
  });

  it("renders a loading shell while loading", () => {
    detailLoadingSignal.value = true;
    detailSignal.value = null;
    const { container } = render(h(DetailView, {}));
    // The bare "Loading…" text was replaced by the content-shaped detail skeleton.
    expect(container.querySelector(".skeleton-detail")).toBeTruthy();
  });

  it("renders the title, project and messages", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail();
    const { container, getByText } = render(h(DetailView, {}));
    expect(container.querySelector(".d-title")?.textContent).toBe("My session");
    expect(getByText("Messages (2)")).toBeTruthy();
    expect(container.querySelectorAll(".d-msg").length).toBe(2);
  });

  it("renders newest-first in last mode", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ detailMode: "last" });
    const { container } = render(h(DetailView, {}));
    const contents = [...container.querySelectorAll(".d-msg-content")].map((e) => e.textContent);
    // last mode reverses → assistant "second" first.
    expect(contents[0]).toBe("second");
  });

  it("renders every match while searching — no 'Show more' truncation of the match set", async () => {
    vi.useFakeTimers();
    try {
      currentProjectSignal.value = "proj";
      // 210 messages > MESSAGE_WINDOW (200). In the paged view this truncates
      // behind "Show more"; while searching, all matches must render.
      const many = Array.from({ length: 210 }, (_, i) =>
        msg({ content: `match ${i} widget` }),
      );
      detailSignal.value = detail({
        messages: many,
        totalMessages: 210,
        detailQuery: "widget",
        totalMatches: 210,
      });
      const { container } = render(h(DetailView, {}));

      const input = container.querySelector(".d-msg-search-input") as HTMLInputElement;
      fireEvent.input(input, { target: { value: "widget" } });
      // Flush the 250ms search debounce so debouncedQuery → "widget" and the
      // view enters search mode (renders all matches, no windowing).
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(container.querySelector(".show-more-row")).toBeNull();
      expect(container.querySelectorAll(".d-msg").length).toBe(210);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the cross-project notice when the session is from another project", () => {
    currentProjectSignal.value = "other";
    detailSignal.value = detail({ project: "proj", projectKey: "proj" });
    const { container, getByText } = render(h(DetailView, {}));
    expect(container.querySelector(".d-notice")).toBeTruthy();
    expect(getByText(/Open .* to resume/)).toBeTruthy();
  });

  it("shows the resume action for a same-project session", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail();
    const { getByText } = render(h(DetailView, {}));
    expect(getByText("Resume")).toBeTruthy();
  });

  it("shows the latest/earliest toggle (shared Segmented) only for long transcripts", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ totalMessages: 200 });
    const { container, getByText } = render(h(DetailView, {}));
    // Migrated from the legacy .vs-segmented pill to the shared <Segmented>
    // (native .vsc-segmented track look), so the selected-state matches every
    // other segmented control in the app.
    expect(container.querySelector(".vsc-segmented")).toBeTruthy();
    expect(getByText("Latest")).toBeTruthy();
    expect(getByText("Earliest")).toBeTruthy();
  });

  it("hides the toggle for short transcripts", () => {
    currentProjectSignal.value = "proj";
    detailSignal.value = detail({ totalMessages: 2 });
    const { container } = render(h(DetailView, {}));
    expect(container.querySelector(".vsc-segmented")).toBeNull();
  });

  describe("worktree", () => {
    it("renders the worktree info row (kind, path, branch, repo) for a claude worktree", () => {
      currentProjectSignal.value = "proj";
      worktreesSignal.value = { a: ref() };
      detailSignal.value = detail();
      const { container } = render(h(DetailView, {}));
      const block = container.querySelector(".d-worktree");
      expect(block).toBeTruthy();
      expect(block?.textContent).toContain("Claude-created worktree");
      const values = [...container.querySelectorAll(".d-worktree__v")].map((e) => e.textContent);
      expect(values).toContain("/repo/.claude/worktrees/feat");
      expect(values).toContain("worktree-feat");
      expect(values).toContain("/repo");
    });

    it("omits the info row for a main-checkout ref", () => {
      currentProjectSignal.value = "proj";
      worktreesSignal.value = { a: ref({ kind: "main" }) };
      detailSignal.value = detail();
      const { container } = render(h(DetailView, {}));
      expect(container.querySelector(".d-worktree")).toBeNull();
    });

    it("labels the primary action 'Resume in worktree' for an existing worktree", () => {
      currentProjectSignal.value = "proj";
      worktreesSignal.value = { a: ref() };
      detailSignal.value = detail();
      const { getByText } = render(h(DetailView, {}));
      expect(getByText("Resume in worktree")).toBeTruthy();
    });

    it("offers Recreate worktree and fires createWorktree for a removed claude worktree", () => {
      currentProjectSignal.value = "proj";
      worktreesSignal.value = { a: ref({ exists: false, kind: "claude" }) };
      detailSignal.value = detail();
      const { getByText, queryByText } = render(h(DetailView, {}));
      // Resume is gone — the checkout no longer exists.
      expect(queryByText("Resume")).toBeNull();
      expect(queryByText("Resume in worktree")).toBeNull();
      const btn = getByText("Recreate worktree");
      fireEvent.click(btn);
      expect(post).toHaveBeenCalledWith({ type: "createWorktree", sessionId: "a" });
    });

    it("explains a removed user worktree without offering recreate", () => {
      currentProjectSignal.value = "proj";
      worktreesSignal.value = { a: ref({ exists: false, kind: "user" }) };
      detailSignal.value = detail();
      const { container, queryByText } = render(h(DetailView, {}));
      expect(queryByText("Recreate worktree")).toBeNull();
      expect(container.querySelector(".d-notice")?.textContent).toContain("removed from disk");
    });
  });
});
