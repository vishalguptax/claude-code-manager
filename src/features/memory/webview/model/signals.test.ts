/**
 * Tests for the memory tab's reactive state.
 *
 * The computed chain (project scope → health lens → search) and the
 * selected-memory lookup are what the views read, so they are asserted
 * directly rather than through a rendered component.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { MemoryFile, MemoryStore } from "../../types";
import {
  applyError,
  applyStore,
  errorMessage,
  lens,
  loading,
  projects,
  resetMemorySignals,
  searchQuery,
  selectMemory,
  selectedMemory,
  selectedProject,
  store,
  totals,
  visibleMemories,
} from "./signals";

function mem(project: string, fileName: string, over: Partial<MemoryFile> = {}): MemoryFile {
  const name = fileName.replace(/\.md$/, "");
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
      originSessionId: "sid",
      modified: "",
    },
    hasFrontmatter: true,
    excerpt: `Body of ${name}.`,
    links: [],
    inboundCount: 0,
    indexed: true,
    orphan: false,
    truncated: false,
    sizeBytes: 10,
    mtimeMs: 0,
    ...over,
  };
}

function makeStore(): MemoryStore {
  return {
    enabled: true,
    root: "/root",
    projects: [
      {
        slug: "-p-one",
        label: "one",
        dir: "/root/-p-one/memory",
        memories: [
          mem("-p-one", "alpha.md"),
          mem("-p-one", "beta.md", { orphan: true, indexed: false }),
          mem("-p-one", "gamma.md", {
            links: [{ target: "nowhere", resolved: false }],
          }),
        ],
        index: [],
        hasIndex: false,
        brokenLinks: ["nowhere"],
        orphanCount: 1,
      },
      {
        slug: "-p-two",
        label: "two",
        dir: "/root/-p-two/memory",
        memories: [mem("-p-two", "delta.md")],
        index: [],
        hasIndex: false,
        brokenLinks: [],
        orphanCount: 0,
      },
    ],
  };
}

beforeEach(resetMemorySignals);

describe("initial state", () => {
  it("starts loading with nothing selected", () => {
    expect(loading.value).toBe(true);
    expect(store.value).toBeNull();
    expect(projects.value).toEqual([]);
    expect(visibleMemories.value).toEqual([]);
    expect(totals.value).toEqual({ total: 0, orphans: 0, broken: 0 });
  });
});

describe("applyStore", () => {
  it("publishes the store and clears loading and errors", () => {
    applyError("boom");
    applyStore(makeStore());
    expect(loading.value).toBe(false);
    expect(errorMessage.value).toBeNull();
    expect(projects.value.map((p) => p.slug)).toEqual(["-p-one", "-p-two"]);
    expect(totals.value).toEqual({ total: 4, orphans: 1, broken: 1 });
  });
});

describe("applyError", () => {
  it("records the message and stops loading", () => {
    applyError("could not read the memory directory");
    expect(errorMessage.value).toBe("could not read the memory directory");
    expect(loading.value).toBe(false);
  });
});

describe("visibleMemories", () => {
  beforeEach(() => applyStore(makeStore()));

  it("shows every project by default", () => {
    expect(visibleMemories.value).toHaveLength(4);
  });

  it("scopes to the selected project", () => {
    selectedProject.value = "-p-two";
    expect(visibleMemories.value.map((m) => m.fileName)).toEqual(["delta.md"]);
  });

  it("applies the orphan lens", () => {
    lens.value = "orphans";
    expect(visibleMemories.value.map((m) => m.fileName)).toEqual(["beta.md"]);
  });

  it("applies the broken-link lens", () => {
    lens.value = "broken";
    expect(visibleMemories.value.map((m) => m.fileName)).toEqual(["gamma.md"]);
  });

  it("composes scope, lens and search", () => {
    selectedProject.value = "-p-one";
    lens.value = "all";
    searchQuery.value = "alpha";
    expect(visibleMemories.value.map((m) => m.fileName)).toEqual(["alpha.md"]);
  });

  it("can compose down to nothing", () => {
    lens.value = "orphans";
    searchQuery.value = "alpha";
    expect(visibleMemories.value).toEqual([]);
  });
});

describe("selectedMemory", () => {
  beforeEach(() => applyStore(makeStore()));

  it("is null with nothing selected", () => {
    expect(selectedMemory.value).toBeNull();
  });

  it("resolves across projects by id", () => {
    selectMemory("-p-two/delta.md");
    expect(selectedMemory.value?.fileName).toBe("delta.md");
  });

  it("falls back to null when the selected memory leaves the store", () => {
    // What happens right after a delete: the host re-pushes a store without
    // the file, and the detail view must not keep rendering it.
    selectMemory("-p-one/beta.md");
    expect(selectedMemory.value).not.toBeNull();
    const next = makeStore();
    next.projects[0].memories = next.projects[0].memories.filter(
      (m) => m.fileName !== "beta.md",
    );
    applyStore(next);
    expect(selectedMemory.value).toBeNull();
  });

  it("is null for an id no project holds", () => {
    selectMemory("-p-none/nope.md");
    expect(selectedMemory.value).toBeNull();
  });
});
