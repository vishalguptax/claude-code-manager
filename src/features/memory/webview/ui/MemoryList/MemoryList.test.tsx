// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { MemoryFile, MemoryStore } from "../../../types";
import { applyStore, lens, resetMemorySignals, searchQuery, selectedProject } from "../../model";
import { MemoryList } from "./MemoryList";

/** A memory shaped exactly like the parser's output. */
function mem(project: string, fileName: string, over: Partial<MemoryFile> = {}): MemoryFile {
  const name = fileName.replace(/\.md$/, "").replace(/_/g, "-");
  return {
    project,
    fileName,
    path: `/root/${project}/memory/${fileName}`,
    id: `${project}/${fileName}`,
    meta: {
      name,
      description: `Summary for ${name}`,
      type: "feedback",
      nodeType: "memory",
      originSessionId: "e66c2065-3a32-4197-ba38-b46852bbd3b0",
      modified: "2026-08-05T12:00:40.877Z",
    },
    hasFrontmatter: true,
    excerpt: `Body of ${name}.`,
    links: [],
    inboundCount: 1,
    indexed: true,
    orphan: false,
    truncated: false,
    sizeBytes: 900,
    mtimeMs: 1_750_000_000_000,
    ...over,
  };
}

function storeWith(memories: MemoryFile[], enabled = true): MemoryStore {
  const bySlug = new Map<string, MemoryFile[]>();
  for (const m of memories) {
    bySlug.set(m.project, [...(bySlug.get(m.project) ?? []), m]);
  }
  return {
    enabled,
    root: "/Users/me/.claude/projects",
    projects: [...bySlug].map(([slug, list]) => ({
      slug,
      label: slug.replace(/^-p-/, ""),
      dir: `/root/${slug}/memory`,
      memories: list,
      index: [],
      hasIndex: false,
      brokenLinks: list.flatMap((m) => m.links.filter((l) => !l.resolved).map((l) => l.target)),
      orphanCount: list.filter((m) => m.orphan).length,
    })),
  };
}

const props = () => ({ onSelect: vi.fn(), onRefresh: vi.fn() });

/** The rendered rows. Rows are `.list-item` buttons, not <li>s, like every
 *  other list tab, so they are counted by the feature's row class. */
const rows = (container: Element): Element[] => [...container.querySelectorAll(".mem-item")];

beforeEach(resetMemorySignals);

describe("MemoryList — empty states", () => {
  it("explains that auto-memory is switched off", () => {
    applyStore({ enabled: false, root: "/Users/me/.claude/projects", projects: [] });
    render(h(MemoryList, props()));
    expect(screen.getByText("Auto-memory is off")).toBeTruthy();
    expect(screen.getByText(/autoMemoryEnabled/)).toBeTruthy();
  });

  it("says auto-memory is off even when the store still holds old memories", () => {
    // The setting can be switched off after Claude Code has written a store.
    // What the user needs to know is that nothing new is coming, not what it
    // wrote last month — and that answer must not depend on the row count.
    const many = Array.from({ length: 60 }, (_, i) => mem("-p-one", `m-${i}.md`));
    applyStore(storeWith(many, false));
    render(h(MemoryList, props()));
    expect(screen.getByText("Auto-memory is off")).toBeTruthy();
    expect(screen.queryByText("m-0")).toBeNull();
  });

  it("names the directory it looked in when the store is empty", () => {
    applyStore(storeWith([]));
    render(h(MemoryList, props()));
    expect(screen.getByText("No memories yet")).toBeTruthy();
    expect(screen.getByText(/\/Users\/me\/\.claude\/projects/)).toBeTruthy();
  });

  it("offers a way back when a search matches nothing", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md")]));
    searchQuery.value = "zzzz";
    render(h(MemoryList, props()));
    expect(screen.getByText("No matching memories")).toBeTruthy();
    expect(screen.getByText(/clear the search/)).toBeTruthy();
  });

  // Each filter empties the list for a different reason, and "clear the
  // search" is useless advice to someone who picked a lens instead.
  it("says what a lens found instead of blaming the search", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md")]));
    lens.value = "orphans";
    render(h(MemoryList, props()));
    expect(screen.getByText("No orphans here")).toBeTruthy();
    lens.value = "broken";
    render(h(MemoryList, props()));
    expect(screen.getByText("No broken links")).toBeTruthy();
  });

  it("names the project when the scoped project has nothing in it", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md"), mem("-p-two", "delta.md")]));
    // A project scope the store knows but whose memories are all filtered out
    // by an earlier delete on the host.
    selectedProject.value = "-p-three";
    render(h(MemoryList, props()));
    expect(screen.getByText("No memories in this project")).toBeTruthy();
  });

  // Every tab's root is `.panel`: tabs.css scopes the scroll region to it, so
  // a feature that roots itself anywhere else cannot scroll inside the pane.
  it("roots the view in the shared panel", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md")]));
    const { container } = render(h(MemoryList, props()));
    expect(container.firstElementChild?.className).toBe("panel");
    // The search field sits in the shared row, which carries the inset that
    // lines it up with the rows below.
    expect(container.querySelector(".search-row .vsc-search")).toBeTruthy();
  });
});

describe("MemoryList — rows", () => {
  it("renders one row per memory with its slug, description and filename", () => {
    applyStore(
      storeWith([
        mem("-p-one", "feedback_no_workarounds.md"),
        mem("-p-one", "cites.md"),
      ]),
    );
    const { container } = render(h(MemoryList, props()));
    expect(screen.getByText("feedback-no-workarounds")).toBeTruthy();
    // The filename is shown alongside the slug precisely because real data
    // has files whose stem is not the slug.
    expect(screen.getByText("feedback_no_workarounds.md")).toBeTruthy();
    expect(screen.getByText("Summary for cites")).toBeTruthy();
    expect(rows(container)).toHaveLength(2);
  });

  it("renders a memory whose type Claude Code has never written before", () => {
    const weird = mem("-p-one", "weird.md");
    weird.meta.type = "experimental-new-kind";
    applyStore(storeWith([weird]));
    render(h(MemoryList, props()));
    expect(screen.getByText("weird")).toBeTruthy();
    expect(screen.getByText("experimental-new-kind")).toBeTruthy();
  });

  it("falls back to the excerpt when the file has no description", () => {
    const bare = mem("-p-one", "raw-note.md", { hasFrontmatter: false });
    bare.meta.description = "";
    bare.excerpt = "Just prose, no fence.";
    applyStore(storeWith([bare]));
    render(h(MemoryList, props()));
    expect(screen.getByText("Just prose, no fence.")).toBeTruthy();
    expect(screen.getByTitle(/no --- block/)).toBeTruthy();
  });

  it("flags an orphan and explains why on hover", () => {
    applyStore(storeWith([mem("-p-one", "lonely.md", { orphan: true, indexed: false, inboundCount: 0 })]));
    render(h(MemoryList, props()));
    const chip = screen.getByText("orphan");
    expect(chip).toBeTruthy();
    expect(screen.getByTitle(/MEMORY\.md does not list it/)).toBeTruthy();
  });

  it("counts broken links in the singular and the plural", () => {
    applyStore(
      storeWith([
        mem("-p-one", "one.md", { links: [{ target: "gone", resolved: false }] }),
        mem("-p-one", "two.md", {
          links: [
            { target: "gone", resolved: false },
            { target: "also-gone", resolved: false },
          ],
        }),
      ]),
    );
    render(h(MemoryList, props()));
    expect(screen.getByText("1 broken link")).toBeTruthy();
    expect(screen.getByText("2 broken links")).toBeTruthy();
  });

  it("hands the memory id back on click", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md")]));
    const p = props();
    render(h(MemoryList, p));
    fireEvent.click(screen.getByText("alpha"));
    expect(p.onSelect).toHaveBeenCalledWith("-p-one/alpha.md");
  });

  it("shows the project label on the row only when every project is in scope", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md"), mem("-p-two", "delta.md")]));
    const p = props();
    const { container, rerender } = render(h(MemoryList, p));
    // Scoped to the row class: the project dropdown's trigger also renders a
    // project label, and asserting on the bare text would match that instead.
    expect([...container.querySelectorAll(".mem-project")].map((el) => el.textContent)).toEqual([
      "one",
      "two",
    ]);
    selectedProject.value = "-p-one";
    rerender(h(MemoryList, p));
    expect(container.querySelectorAll(".mem-project")).toHaveLength(0);
  });
});

describe("MemoryList — toolbar", () => {
  beforeEach(() => {
    applyStore(
      storeWith([
        mem("-p-one", "alpha.md"),
        mem("-p-one", "beta.md", { orphan: true, indexed: false }),
        mem("-p-two", "delta.md", { links: [{ target: "gone", resolved: false }] }),
      ]),
    );
  });

  it("puts the store-wide counts in the lens tooltips", () => {
    render(h(MemoryList, props()));
    // The shared <ScopeFilter> carries counts in each segment's title, not in
    // its label, so four segments still fit a 300px sidebar.
    expect(screen.getByTitle("All: 3")).toBeTruthy();
    expect(screen.getByTitle("Orphans: 1")).toBeTruthy();
    expect(screen.getByTitle("Broken: 1")).toBeTruthy();
  });

  it("switches the visible rows when a lens is chosen", () => {
    const p = props();
    const { container, rerender } = render(h(MemoryList, p));
    expect(rows(container)).toHaveLength(3);
    fireEvent.click(screen.getByText("Orphans"));
    rerender(h(MemoryList, p));
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("reflects a lens set outside the component", () => {
    lens.value = "broken";
    const { container } = render(h(MemoryList, props()));
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText("delta")).toBeTruthy();
  });

  it("names the refresh button for assistive tech", () => {
    const p = props();
    render(h(MemoryList, p));
    const reload = screen.getByLabelText("Refresh memories");
    fireEvent.click(reload);
    expect(p.onRefresh).toHaveBeenCalled();
  });

  it("labels the search field", () => {
    render(h(MemoryList, props()));
    expect(screen.getByLabelText("Search memories")).toBeTruthy();
  });

  it("counts the visible memories in the caption", () => {
    const p = props();
    const { rerender } = render(h(MemoryList, p));
    expect(screen.getByText("3 memories")).toBeTruthy();
    selectedProject.value = "-p-two";
    rerender(h(MemoryList, p));
    expect(screen.getByText("1 memory")).toBeTruthy();
  });
});
