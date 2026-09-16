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

beforeEach(resetMemorySignals);

describe("MemoryList — empty states", () => {
  it("explains that auto-memory is switched off", () => {
    applyStore({ enabled: false, root: "/Users/me/.claude/projects", projects: [] });
    render(h(MemoryList, props()));
    expect(screen.getByText("Auto-memory is off")).toBeTruthy();
    expect(screen.getByText(/autoMemoryEnabled/)).toBeTruthy();
  });

  it("names the directory it looked in when the store is empty", () => {
    applyStore(storeWith([]));
    render(h(MemoryList, props()));
    expect(screen.getByText("No memories yet")).toBeTruthy();
    expect(screen.getByText(/\/Users\/me\/\.claude\/projects/)).toBeTruthy();
  });

  it("offers a way back when a filter matches nothing", () => {
    applyStore(storeWith([mem("-p-one", "alpha.md")]));
    searchQuery.value = "zzzz";
    render(h(MemoryList, props()));
    expect(screen.getByText("Nothing matches")).toBeTruthy();
    expect(screen.getByText("Clear the search or lens.")).toBeTruthy();
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
    render(h(MemoryList, props()));
    expect(screen.getByText("feedback-no-workarounds")).toBeTruthy();
    // The filename is shown alongside the slug precisely because real data
    // has files whose stem is not the slug.
    expect(screen.getByText("feedback_no_workarounds.md")).toBeTruthy();
    expect(screen.getByText("Summary for cites")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
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

  it("puts the store-wide counts on the lens labels", () => {
    render(h(MemoryList, props()));
    expect(screen.getByText("All 3")).toBeTruthy();
    expect(screen.getByText("Orphans 1")).toBeTruthy();
    expect(screen.getByText("Broken 1")).toBeTruthy();
  });

  it("switches the visible rows when a lens is chosen", () => {
    const p = props();
    const { rerender } = render(h(MemoryList, p));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByText("Orphans 1"));
    rerender(h(MemoryList, p));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("beta")).toBeTruthy();
  });

  it("reflects a lens set outside the component", () => {
    lens.value = "broken";
    render(h(MemoryList, props()));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("delta")).toBeTruthy();
  });

  it("names the reload button for assistive tech", () => {
    const p = props();
    render(h(MemoryList, p));
    const reload = screen.getByLabelText("Reload memories from disk");
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
