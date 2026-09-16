// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { PromptEntry } from "../../../types";
import { applyPrompts, projectFilter, resetPromptSignals, searchQuery } from "../../model";
import { PromptList, type PromptListProps } from "./PromptList";

function entry(over: Partial<PromptEntry> = {}): PromptEntry {
  return {
    id: "s#0",
    text: "refactor the session parser",
    timestamp: Date.now() - 60_000,
    projectPath: "/w/app",
    projectName: "app",
    sessionId: "09285b5a-1542-4940-b2a8-ef73977f6fe1",
    repeatCount: 1,
    attachmentCount: 0,
    attachmentChars: 0,
    ...over,
  };
}

/** A realistic multi-project history. */
function history(): PromptEntry[] {
  return [
    entry({ id: "1", text: "refactor the session parser", projectPath: "/w/app", projectName: "app" }),
    entry({ id: "2", text: "write the release notes", projectPath: "/w/app", projectName: "app" }),
    entry({
      id: "3",
      text: "why is the build slow",
      projectPath: "/w/site",
      projectName: "site",
      sessionId: "0bc64250-c3a3-4936-a32e-2a261f3f49a0",
    }),
  ];
}

function renderList(over: Partial<PromptListProps> = {}) {
  const props: PromptListProps = {
    onCopy: vi.fn(),
    onOpenSession: vi.fn(),
    onRefresh: vi.fn(),
    ...over,
  };
  return render(<PromptList {...props} />);
}

beforeEach(() => {
  resetPromptSignals();
});

afterEach(cleanup);

describe("PromptList — shell", () => {
  it("roots the tab in the shared .panel so the pane bounds its scroll", () => {
    // `.tab-content .panel` (tabs.css) is what gives a feature its height and
    // its single scroll container. A private root class opts the tab out of
    // the layout every other tab is built on.
    applyPrompts(history());
    const { container } = renderList();
    expect(container.firstElementChild?.className).toBe("panel");
  });

  it("puts the search field in the shared .search-row", () => {
    // The row's --space-2xl inset is what lines the field's left edge up with
    // the row text below it; a bespoke toolbar is how the gap came back.
    applyPrompts(history());
    const { container } = renderList();
    const row = container.querySelector(".panel > .search-row");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".vsc-search")).toBeTruthy();
  });

  it("offers a refresh action beside the search field", () => {
    const onRefresh = vi.fn();
    applyPrompts(history());
    renderList({ onRefresh });
    fireEvent.click(screen.getByLabelText("Refresh prompt history"));
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe("PromptList — empty", () => {
  it("explains where prompts come from when the history is empty", () => {
    applyPrompts([]);
    renderList();
    expect(screen.getByText("No prompt history yet")).toBeTruthy();
    expect(screen.getByText("~/.claude/history.jsonl")).toBeTruthy();
  });

  it("shows a different, recoverable empty state when a filter matches nothing", () => {
    applyPrompts(history());
    searchQuery.value = "nothing matches this";
    renderList();
    expect(screen.getByText("No matching prompts")).toBeTruthy();
    // The search field stays on screen so the user can back out of the filter.
    expect(screen.getByLabelText("Search prompts")).toBeTruthy();
  });

  it("drops the count caption when there is no history to count", () => {
    applyPrompts([]);
    const { container } = renderList();
    expect(container.querySelector(".list-count")).toBeNull();
  });
});

describe("PromptList — one and many", () => {
  it("renders a single prompt with a singular caption", () => {
    applyPrompts([entry({ text: "just the one" })]);
    renderList();
    expect(screen.getByText("just the one")).toBeTruthy();
    expect(screen.getByText("1 prompt")).toBeTruthy();
  });

  it("windows the list rather than rendering every row", () => {
    // 500 rows, a fraction of a real history. The virtualizer must not put
    // them all in the DOM.
    applyPrompts(
      Array.from({ length: 500 }, (_, i) => entry({ id: `id-${i}`, text: `prompt ${i}` })),
    );
    const { container } = renderList();
    expect(screen.getByText("500 prompts")).toBeTruthy();
    expect(container.querySelectorAll(".prompt-item").length).toBeLessThan(500);
  });

  it("gives the windowed list the shared .list class so the panel bounds it", () => {
    applyPrompts(history());
    const { container } = renderList();
    const list = container.querySelector('[role="list"]');
    expect(list?.classList.contains("list")).toBe(true);
    expect(list?.classList.contains("virtual-list")).toBe(true);
  });

  it("names the list for screen readers and reports the real total per row", () => {
    applyPrompts(history());
    const { container } = renderList();
    expect(container.querySelector('[role="list"]')?.getAttribute("aria-label")).toBe(
      "Prompt history",
    );
    expect(
      container.querySelector('[role="listitem"]')?.getAttribute("aria-setsize"),
    ).toBe("3");
  });
});

describe("PromptList — filtering", () => {
  it("narrows on the search field and reports the filtered-of-total count", async () => {
    applyPrompts(history());
    renderList();

    fireEvent.input(screen.getByLabelText("Search prompts"), {
      target: { value: "release" },
    });

    await waitFor(() => expect(screen.getByText("1 prompt of 3")).toBeTruthy());
    expect(screen.getByText("write the release notes")).toBeTruthy();
    expect(screen.queryByText("why is the build slow")).toBeNull();
  });

  it("offers a project filter listing each project and its count", () => {
    applyPrompts(history());
    renderList();
    const filter = screen.getByLabelText("Filter by project");
    expect(filter).toBeTruthy();
    fireEvent.click(filter);

    // Scope to the popup: "app" and "site" also appear as each row's project
    // label, so an unscoped query would pass for the wrong reason.
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("All projects")).toBeTruthy();
    expect(menu.getByText("app")).toBeTruthy();
    expect(menu.getByText("site")).toBeTruthy();
    // Counts ride along so the user can see where their prompts are.
    expect(menu.getByText("2")).toBeTruthy();
  });

  it("hides the project filter when every prompt came from one project", () => {
    applyPrompts([entry(), entry({ id: "2", text: "second" })]);
    renderList();
    expect(screen.queryByLabelText("Filter by project")).toBeNull();
  });

  it("shows only the selected project's prompts", () => {
    applyPrompts(history());
    projectFilter.value = "/w/site";
    renderList();
    expect(screen.getByText("1 prompt of 3")).toBeTruthy();
    expect(screen.getByText("why is the build slow")).toBeTruthy();
  });
});

describe("PromptList — actions", () => {
  it("passes copy through to the caller", () => {
    const onCopy = vi.fn();
    applyPrompts([entry({ text: "copy me" })]);
    renderList({ onCopy });
    fireEvent.click(screen.getByTitle("Copy prompt"));
    expect(onCopy).toHaveBeenCalledWith("copy me");
  });

  it("passes open-session through to the caller", () => {
    // The row itself is the open affordance — this tab has no detail view, so
    // the row click does the one navigational thing a prompt can do.
    const onOpenSession = vi.fn();
    applyPrompts([entry()]);
    renderList({ onOpenSession });
    fireEvent.click(screen.getByTitle("Open the session this prompt was typed in"));
    expect(onOpenSession).toHaveBeenCalledWith("09285b5a-1542-4940-b2a8-ef73977f6fe1");
  });
});
