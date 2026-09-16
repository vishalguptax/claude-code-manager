// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { CheckpointSessionSummary } from "../../../types";
import {
  applyError,
  applySessions,
  resetCheckpointSignals,
  sessionQuery,
} from "../../model";
import { CheckpointSessions } from "./CheckpointSessions";

const SESSION = "09285b5a-1542-4940-b2a8-ef73977f6fe1";
const OTHER = "0bc64250-c3a3-4936-a32e-2a261f3f49a0";

/** Realistic summary — the shape listCheckpointSessions actually produces. */
function summary(
  overrides: Partial<CheckpointSessionSummary> = {},
): CheckpointSessionSummary {
  return {
    sessionId: SESSION,
    label: "Rewrite the checkpoint parser",
    project: "claude-code-manager",
    fileCount: 4,
    versionCount: 11,
    lastBackupMs: Date.now() - 2 * 60 * 60 * 1000,
    sizeBytes: 148_480,
    ...overrides,
  };
}

beforeEach(resetCheckpointSignals);

describe("CheckpointSessions", () => {
  it("shows a skeleton-free empty state once an empty list arrives", () => {
    applySessions([]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(screen.getByText("No file checkpoints yet")).toBeTruthy();
    // The path to the real directory is part of the explanation.
    expect(screen.getByText("~/.claude/file-history")).toBeTruthy();
  });

  it("renders nothing but the loading shell before the first reply", () => {
    // loadingSessions is still true and the list is empty: the empty state
    // must NOT claim there are no checkpoints yet.
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(screen.queryByText("No file checkpoints yet")).toBeNull();
  });

  it("renders one session with its counts", () => {
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));

    expect(screen.getByText("Rewrite the checkpoint parser")).toBeTruthy();
    expect(screen.getByText("claude-code-manager")).toBeTruthy();
    expect(screen.getByText("4 files")).toBeTruthy();
    expect(screen.getByText("11 versions")).toBeTruthy();
    expect(screen.getByText("145.0 KB")).toBeTruthy();
    expect(screen.getByText("1 session with checkpoints")).toBeTruthy();
  });

  it("uses singular nouns for a one-file, one-version session", () => {
    applySessions([summary({ fileCount: 1, versionCount: 1 })]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(screen.getByText("1 file")).toBeTruthy();
    expect(screen.getByText("1 version")).toBeTruthy();
  });

  it("renders many sessions and pluralises the count", () => {
    applySessions([
      summary(),
      summary({ sessionId: OTHER, label: "Fix the hook parser", project: "api" }),
    ]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(screen.getByText("2 sessions with checkpoints")).toBeTruthy();
    expect(screen.getByText("Fix the hook parser")).toBeTruthy();
  });

  it("omits the project when the host could not resolve one", () => {
    applySessions([summary({ project: "" })]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(document.querySelector(".ckpt-project")).toBeNull();
  });

  it("exposes the full session id on the label for identification", () => {
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    // The label is a human name; the id is what a user needs to correlate
    // with ~/.claude/file-history, so it must survive on an attribute.
    expect(
      screen.getByText("Rewrite the checkpoint parser").getAttribute("title"),
    ).toBe(SESSION);
  });

  it("reports the selected session id", () => {
    const onSelect = vi.fn();
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect, onRefresh: vi.fn() }));
    fireEvent.click(screen.getByText("Rewrite the checkpoint parser"));
    expect(onSelect).toHaveBeenCalledWith(SESSION);
  });

  it("selects on Enter for keyboard-only navigation", () => {
    const onSelect = vi.fn();
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect, onRefresh: vi.fn() }));
    fireEvent.keyDown(document.querySelector(".ckpt-session") as Element, {
      key: "Enter",
    });
    expect(onSelect).toHaveBeenCalledWith(SESSION);
  });

  it("refreshes from an icon button with an accessible name", () => {
    const onRefresh = vi.fn();
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh }));
    const button = screen.getByLabelText("Refresh checkpoint sessions");
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a host error above a populated list rather than blanking it", () => {
    applySessions([summary()]);
    applyError("Could not read ~/.claude/file-history");
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not read ~/.claude/file-history",
    );
    expect(screen.getByText("Rewrite the checkpoint parser")).toBeTruthy();
  });
});

describe("CheckpointSessions — house list contract", () => {
  // `.tab-content .panel` (tabs.css) is what gives a tab its scroll. A root
  // that is not `.panel` cannot scroll at all, however long the list gets.
  it("roots the view in a .panel", () => {
    applySessions([summary()]);
    const { container } = render(
      h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }),
    );
    expect((container.firstChild as HTMLElement).className).toContain("panel");
  });

  // The 2xl inset on `.search-row` is what lines the field up with the row
  // text below it; a bare <SearchInput> sits flush against the panel edge.
  it("wraps the search field in the shared .search-row", () => {
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    const field = screen.getByLabelText("Search checkpoint sessions");
    expect(field.closest(".search-row")).toBeTruthy();
  });

  it("builds rows from the shared .item vocabulary", () => {
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    const row = document.querySelector(".ckpt-session") as HTMLElement;
    expect(row.className).toContain("item");
    expect(row.querySelector(".item-name")).toBeTruthy();
    expect(row.querySelector(".item-prompt")).toBeTruthy();
    // Rows live inside the shared scrolling list, not a bespoke container.
    expect(row.closest(".list")).toBeTruthy();
  });

  it("filters the rows from the search field", async () => {
    applySessions([
      summary(),
      summary({ sessionId: OTHER, label: "Fix the hook parser", project: "api" }),
    ]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    sessionQuery.value = "hook";
    await waitFor(() =>
      expect(screen.queryByText("Rewrite the checkpoint parser")).toBeNull(),
    );
    expect(screen.getByText("Fix the hook parser")).toBeTruthy();
    // The total stays honest: the caption counts the session list, not the
    // filtered view, so a filter never looks like a deletion.
    expect(screen.getByText("2 sessions with checkpoints")).toBeTruthy();
  });

  it("explains a search that matches nothing", async () => {
    applySessions([summary()]);
    render(h(CheckpointSessions, { onSelect: vi.fn(), onRefresh: vi.fn() }));
    sessionQuery.value = "zzz";
    await waitFor(() => expect(screen.getByText("No matching sessions")).toBeTruthy());
    // The field must survive the empty state, or the search cannot be undone.
    expect(screen.getByLabelText("Search checkpoint sessions")).toBeTruthy();
  });
});
