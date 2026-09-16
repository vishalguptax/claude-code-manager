// @vitest-environment happy-dom
/**
 * Tests for the Memory tab root: the mount handshake, the bus wiring, and the
 * list ↔ detail switch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import {
  _resetMessageBus,
  _resetPaletteSources,
  activeTab,
  collectPaletteItems,
  dispatch,
} from "../../../../webview/shared/model";
import type { Message } from "../../../../shared/protocol/schemas";
import type { MemoryStore } from "../../types";
import { applyStore, resetMemorySignals, selectedId, selectMemory, store } from "../model";
import MemoryTab, { applyMemoryMessage } from "../index";

const STORE: MemoryStore = {
  enabled: true,
  root: "/Users/me/.claude/projects",
  projects: [
    {
      slug: "-p-one",
      label: "one",
      dir: "/Users/me/.claude/projects/-p-one/memory",
      memories: [
        {
          project: "-p-one",
          fileName: "alpha.md",
          path: "/Users/me/.claude/projects/-p-one/memory/alpha.md",
          id: "-p-one/alpha.md",
          meta: {
            name: "alpha",
            description: "The first memory",
            type: "feedback",
            nodeType: "memory",
            originSessionId: "e66c2065-3a32-4197-ba38-b46852bbd3b0",
            modified: "",
          },
          hasFrontmatter: true,
          excerpt: "Body of alpha.",
          links: [],
          inboundCount: 0,
          indexed: true,
          orphan: false,
          truncated: false,
          sizeBytes: 400,
          mtimeMs: 1_750_000_000_000,
        },
      ],
      index: [],
      hasIndex: false,
      brokenLinks: [],
      orphanCount: 0,
    },
  ],
};

/** Dispatch a host message through the real bus, as the host would. */
function push(msg: unknown): void {
  dispatch(msg as Message);
}

let posted: unknown[];

beforeEach(() => {
  resetMemorySignals();
  _resetMessageBus();
  _resetPaletteSources();
  posted = [];
  setVscodeApi({ postMessage: (m: unknown) => posted.push(m) } as never);
});

describe("applyMemoryMessage", () => {
  it("applies a memoryStore message", () => {
    applyMemoryMessage({ type: "memoryStore", data: STORE } as never);
    expect(store.value?.projects).toHaveLength(1);
  });

  it("ignores another feature's message that shares the prefix", () => {
    applyMemoryMessage({ type: "memoryUnknown", data: STORE } as never);
    expect(store.value).toBeNull();
  });

  it("ignores a memoryStore with no payload", () => {
    applyMemoryMessage({ type: "memoryStore" });
    expect(store.value).toBeNull();
  });
});

describe("MemoryTab", () => {
  it("requests the store on mount and shows a skeleton until it lands", () => {
    render(h(MemoryTab, {}));
    expect(posted).toEqual([{ type: "getMemories" }]);
    expect(screen.queryByText("alpha")).toBeNull();
  });

  it("renders the list once the host replies through the bus", async () => {
    render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    expect(await screen.findByText("alpha")).toBeTruthy();
  });

  it("surfaces a host error above the list", async () => {
    render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    push({ type: "error", message: "Could not read ~/.claude/projects" });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not read ~/.claude/projects")).toBeTruthy();
  });

  it("opens the detail view for a clicked row and comes back", async () => {
    const { container } = render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    fireEvent.click(await screen.findByText("alpha"));
    expect((await screen.findByText("All memories")).closest(".panel")).toBeTruthy();
    expect(container.querySelector(".d-title")?.textContent).toBe("alpha");
    fireEvent.click(screen.getByRole("button", { name: /All memories/ }));
    expect(await screen.findByLabelText("Search memories")).toBeTruthy();
  });

  it("sends open, reveal and delete as a project + filename pair", async () => {
    applyStore(STORE);
    selectMemory("-p-one/alpha.md");
    render(h(MemoryTab, {}));
    posted.length = 0;
    fireEvent.click(await screen.findByRole("button", { name: /Open/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reveal in file manager/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    expect(posted).toEqual([
      { type: "openMemory", project: "-p-one", fileName: "alpha.md" },
      { type: "revealMemory", project: "-p-one", fileName: "alpha.md" },
      { type: "deleteMemory", project: "-p-one", fileName: "alpha.md" },
    ]);
  });

  it("unregisters its bus handlers on unmount", () => {
    const { unmount } = render(h(MemoryTab, {}));
    unmount();
    push({ type: "memoryStore", data: STORE });
    // A leaked handler would still apply the store after unmount, and a
    // remount would then double-apply every host push.
    expect(store.value).toBeNull();
  });
});

describe("MemoryTab — command palette", () => {
  it("publishes every memory so Cmd+K finds them", async () => {
    render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    await screen.findByText("alpha");

    const [item] = collectPaletteItems("alpha");
    expect(item.title).toBe("alpha");
    expect(item.subtitle).toBe("The first memory");
    expect(item.group).toBe("Memory");
    expect(item.icon).toBe("brain");
    // The hint names the project the memory belongs to, the one thing two
    // same-named memories differ by.
    expect(item.hint).toBe("one");
  });

  it("opens the chosen memory's detail view on the memory tab", async () => {
    render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    await screen.findByText("alpha");

    collectPaletteItems("alpha")[0].run();
    expect(activeTab.value).toBe("memory");
    expect(selectedId.value).toBe("-p-one/alpha.md");
  });

  it("stops publishing after unmount so a remount does not double-list", async () => {
    const view = render(h(MemoryTab, {}));
    push({ type: "memoryStore", data: STORE });
    await screen.findByText("alpha");

    view.unmount();
    expect(collectPaletteItems("alpha")).toHaveLength(0);
  });
});
