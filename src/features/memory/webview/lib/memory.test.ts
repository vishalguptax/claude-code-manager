/**
 * Tests for the memory tab's pure helpers.
 *
 * Fixtures mirror the real store: two projects, a memory whose filename stem
 * differs from its `name:` slug, a self-link, a broken link, and a memory the
 * index lists but nothing links to.
 */
import { describe, expect, it } from "vitest";
import type { MemoryFile, MemoryProject, MemoryStore } from "../../types";
import {
  applyLens,
  backlinksOf,
  flattenMemories,
  indexEntryOf,
  memoriesInProject,
  projectOf,
  resolveLink,
  searchMemories,
  storeTotals,
} from "./memory";

function mem(
  project: string,
  fileName: string,
  name: string,
  over: Partial<MemoryFile> = {},
): MemoryFile {
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
      modified: "",
    },
    hasFrontmatter: true,
    excerpt: `Body of ${name}.`,
    links: [],
    inboundCount: 0,
    indexed: false,
    orphan: false,
    truncated: false,
    sizeBytes: 100,
    mtimeMs: 0,
    ...over,
  };
}

const A = mem("-p-one", "feedback_no_workarounds.md", "feedback-no-workarounds", {
  indexed: true,
  inboundCount: 1,
});
const B = mem("-p-one", "cites.md", "cites", {
  links: [
    { target: "feedback-no-workarounds", resolved: true },
    { target: "gone", resolved: false },
  ],
  orphan: true,
});
const C = mem("-p-one", "listed.md", "listed", { indexed: true });
const D = mem("-p-two", "other.md", "feedback-no-workarounds", { orphan: true });

const STORE: MemoryStore = {
  enabled: true,
  root: "/root",
  projects: [
    {
      slug: "-p-one",
      label: "one",
      dir: "/root/-p-one/memory",
      memories: [A, B, C],
      index: [
        {
          title: "No workarounds",
          fileName: "feedback_no_workarounds.md",
          hook: "standing bar",
          resolved: true,
        },
        { title: "Listed", fileName: "listed.md", hook: "", resolved: true },
      ],
      hasIndex: true,
      brokenLinks: ["gone"],
      orphanCount: 1,
    },
    {
      slug: "-p-two",
      label: "two",
      dir: "/root/-p-two/memory",
      memories: [D],
      index: [],
      hasIndex: false,
      brokenLinks: [],
      orphanCount: 1,
    } satisfies MemoryProject,
  ],
};

describe("flattenMemories", () => {
  it("returns every memory across projects, in store order", () => {
    expect(flattenMemories(STORE).map((m) => m.id)).toEqual([A.id, B.id, C.id, D.id]);
  });

  it("returns nothing for a null store", () => {
    expect(flattenMemories(null)).toEqual([]);
  });
});

describe("memoriesInProject", () => {
  it("scopes to one project", () => {
    expect(memoriesInProject(STORE, "-p-two").map((m) => m.id)).toEqual([D.id]);
  });

  it("returns everything for a null scope", () => {
    expect(memoriesInProject(STORE, null)).toHaveLength(4);
  });

  it("returns nothing for an unknown slug", () => {
    expect(memoriesInProject(STORE, "-p-missing")).toEqual([]);
  });
});

describe("searchMemories", () => {
  const all = flattenMemories(STORE);

  it("returns everything for an empty query", () => {
    expect(searchMemories(all, "   ")).toHaveLength(4);
  });

  it("matches the slug case-insensitively", () => {
    expect(searchMemories(all, "CITES").map((m) => m.id)).toEqual([B.id]);
  });

  it("matches the filename, which is not always the slug", () => {
    expect(searchMemories(all, "feedback_no").map((m) => m.id)).toEqual([A.id]);
  });

  it("matches the description and the excerpt", () => {
    expect(searchMemories(all, "Summary for cites").map((m) => m.id)).toEqual([B.id]);
    expect(searchMemories(all, "Body of listed").map((m) => m.id)).toEqual([C.id]);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchMemories(all, "zzzz")).toEqual([]);
  });
});

describe("applyLens", () => {
  const all = flattenMemories(STORE);

  it("passes everything through for 'all'", () => {
    expect(applyLens(all, "all")).toHaveLength(4);
  });

  it("keeps only orphans", () => {
    expect(applyLens(all, "orphans").map((m) => m.id)).toEqual([B.id, D.id]);
  });

  it("keeps only memories with an unresolved link", () => {
    expect(applyLens(all, "broken").map((m) => m.id)).toEqual([B.id]);
  });
});

describe("resolveLink", () => {
  it("resolves within the linking memory's own project", () => {
    expect(resolveLink(STORE, B, "feedback-no-workarounds")?.id).toBe(A.id);
  });

  it("does not resolve across a project boundary", () => {
    // `-p-two` has a memory with the same name; matching it would turn a real
    // broken link into a false positive.
    const isolated = { ...B, project: "-p-three" };
    expect(resolveLink(STORE, isolated, "feedback-no-workarounds")).toBeNull();
  });

  it("returns null for a target nothing declares", () => {
    expect(resolveLink(STORE, B, "gone")).toBeNull();
  });
});

describe("backlinksOf", () => {
  it("lists the memories that link here", () => {
    expect(backlinksOf(STORE, A).map((m) => m.id)).toEqual([B.id]);
  });

  it("is empty for a memory nothing links to", () => {
    expect(backlinksOf(STORE, C)).toEqual([]);
  });

  it("excludes a self-link", () => {
    const selfLinker = mem("-p-one", "solo.md", "solo", {
      links: [{ target: "solo", resolved: true }],
    });
    const store: MemoryStore = {
      ...STORE,
      projects: [{ ...STORE.projects[0], memories: [selfLinker] }, STORE.projects[1]],
    };
    expect(backlinksOf(store, selfLinker)).toEqual([]);
  });
});

describe("indexEntryOf", () => {
  it("finds the entry by filename", () => {
    expect(indexEntryOf(STORE, A)).toEqual({ title: "No workarounds", hook: "standing bar" });
  });

  it("returns null when the index does not list the file", () => {
    expect(indexEntryOf(STORE, B)).toBeNull();
  });

  it("returns null for a project with no index", () => {
    expect(indexEntryOf(STORE, D)).toBeNull();
  });
});

describe("projectOf", () => {
  it("finds the owning project", () => {
    expect(projectOf(STORE, A)?.slug).toBe("-p-one");
  });

  it("returns null for a null memory or store", () => {
    expect(projectOf(STORE, null)).toBeNull();
    expect(projectOf(null, A)).toBeNull();
  });
});

describe("storeTotals", () => {
  it("counts totals, orphans and memories with broken links", () => {
    expect(storeTotals(STORE)).toEqual({ total: 4, orphans: 2, broken: 1 });
  });

  it("is all zeroes for a null store", () => {
    expect(storeTotals(null)).toEqual({ total: 0, orphans: 0, broken: 0 });
  });
});
