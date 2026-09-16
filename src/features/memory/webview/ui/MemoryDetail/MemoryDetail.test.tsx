// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { MemoryFile, MemoryStore } from "../../../types";
import { applyStore, resetMemorySignals, selectMemory } from "../../model";
import { MemoryDetail } from "./MemoryDetail";

function mem(fileName: string, over: Partial<MemoryFile> = {}): MemoryFile {
  const name = fileName.replace(/\.md$/, "").replace(/_/g, "-");
  return {
    project: "-p-one",
    fileName,
    path: `/Users/me/.claude/projects/-p-one/memory/${fileName}`,
    id: `-p-one/${fileName}`,
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
    inboundCount: 0,
    indexed: false,
    orphan: true,
    truncated: false,
    sizeBytes: 900,
    mtimeMs: 1_750_000_000_000,
    ...over,
  };
}

const HUB = mem("feedback_no_workarounds.md", { orphan: false, indexed: true, inboundCount: 1 });
const CITER = mem("cites.md", {
  links: [
    { target: "feedback-no-workarounds", resolved: true },
    { target: "release-skill-owns-versioning", resolved: false },
  ],
});

function storeWith(memories: MemoryFile[]): MemoryStore {
  return {
    enabled: true,
    root: "/Users/me/.claude/projects",
    projects: [
      {
        slug: "-p-one",
        label: "one",
        dir: "/Users/me/.claude/projects/-p-one/memory",
        memories,
        index: [
          {
            title: "No workarounds, root-cause fixes",
            fileName: "feedback_no_workarounds.md",
            hook: "standing bar for all code",
            resolved: true,
          },
        ],
        hasIndex: true,
        brokenLinks: ["release-skill-owns-versioning"],
        orphanCount: 1,
      },
    ],
  };
}

const props = () => ({
  onBack: vi.fn(),
  onSelect: vi.fn(),
  onOpen: vi.fn(),
  onReveal: vi.fn(),
  onDelete: vi.fn(),
});

beforeEach(resetMemorySignals);

describe("MemoryDetail", () => {
  beforeEach(() => applyStore(storeWith([HUB, CITER])));

  it("shows the slug, description, excerpt and absolute path", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByRole("heading", { name: "cites" })).toBeTruthy();
    expect(screen.getByText("Summary for cites")).toBeTruthy();
    expect(screen.getByText("Body of cites.")).toBeTruthy();
    expect(screen.getByText(CITER.path)).toBeTruthy();
  });

  it("shows the origin session id, which is how a memory is traced back", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByText("Written by session")).toBeTruthy();
    expect(screen.getByText("e66c2065-3a32-4197-ba38-b46852bbd3b0")).toBeTruthy();
  });

  it("separates resolved links from broken ones", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByText("Links out (2)")).toBeTruthy();
    // The broken target is still shown — it is what the user must fix.
    expect(screen.getByText("release-skill-owns-versioning")).toBeTruthy();
    expect(screen.getByTitle("No memory in this project declares this name")).toBeTruthy();
  });

  it("navigates to a resolved link's target", () => {
    selectMemory(CITER.id);
    const p = props();
    render(h(MemoryDetail, p));
    fireEvent.click(screen.getByRole("button", { name: "feedback-no-workarounds" }));
    expect(p.onSelect).toHaveBeenCalledWith(HUB.id);
  });

  it("does not make a broken link clickable", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(
      screen.queryByRole("button", { name: "release-skill-owns-versioning" }),
    ).toBeNull();
  });

  it("lists backlinks and navigates from them", () => {
    selectMemory(HUB.id);
    const p = props();
    render(h(MemoryDetail, p));
    expect(screen.getByText("Links in (1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "cites" }));
    expect(p.onSelect).toHaveBeenCalledWith(CITER.id);
  });

  it("explains an orphan in words, not just a chip", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByText(/this memory is an orphan/)).toBeTruthy();
  });

  it("distinguishes indexed-but-unlinked from orphaned", () => {
    const indexedOnly = mem("listed.md", { indexed: true, orphan: false });
    applyStore(storeWith([indexedOnly]));
    selectMemory(indexedOnly.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByText(/MEMORY\.md indexes it/)).toBeTruthy();
    expect(screen.queryByText("orphan")).toBeNull();
  });

  it("shows the index entry's title and hook", () => {
    selectMemory(HUB.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByText("Index entry")).toBeTruthy();
    expect(
      screen.getByText("No workarounds, root-cause fixes — standing bar for all code"),
    ).toBeTruthy();
  });

  it("wires the three host actions to the selected memory", () => {
    selectMemory(CITER.id);
    const p = props();
    render(h(MemoryDetail, p));
    fireEvent.click(screen.getByRole("button", { name: /Open/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reveal in file manager/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(p.onOpen).toHaveBeenCalledWith(CITER);
    expect(p.onReveal).toHaveBeenCalledWith(CITER);
    expect(p.onDelete).toHaveBeenCalledWith(CITER);
  });

  it("returns to the list from the back button", () => {
    selectMemory(CITER.id);
    const p = props();
    render(h(MemoryDetail, p));
    fireEvent.click(screen.getByRole("button", { name: /All memories/ }));
    expect(p.onBack).toHaveBeenCalled();
  });

  it("moves focus to the heading so keyboard navigation follows", () => {
    selectMemory(CITER.id);
    render(h(MemoryDetail, props()));
    expect(document.activeElement?.textContent).toBe("cites");
  });

  it("degrades to an explanation when the selected memory leaves the store", () => {
    selectMemory(CITER.id);
    const p = props();
    const { rerender } = render(h(MemoryDetail, p));
    applyStore(storeWith([HUB]));
    rerender(h(MemoryDetail, p));
    expect(screen.getByText("That memory is gone")).toBeTruthy();
    // The way back must survive the memory it was showing.
    fireEvent.click(screen.getByRole("button", { name: /All memories/ }));
    expect(p.onBack).toHaveBeenCalled();
  });

  it("flags a file too large to have been read whole", () => {
    const big = mem("huge.md", { truncated: true });
    applyStore(storeWith([big]));
    selectMemory(big.id);
    render(h(MemoryDetail, props()));
    expect(screen.getByTitle(/links past it are not listed/)).toBeTruthy();
  });

  it("omits the modified row when the frontmatter has no timestamp", () => {
    const undated = mem("undated.md");
    undated.meta.modified = "";
    applyStore(storeWith([undated]));
    selectMemory(undated.id);
    render(h(MemoryDetail, props()));
    expect(screen.queryByText("Modified")).toBeNull();
  });
});
