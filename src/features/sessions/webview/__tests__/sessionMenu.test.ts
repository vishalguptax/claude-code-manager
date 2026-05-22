import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSessionMenuItems } from "../components/sessionMenu";

const post = vi.fn();
vi.mock("../../../../webview/hooks/useApi", () => ({
  useApi: () => ({ post: (m: unknown) => post(m) }),
  setVscodeApi: () => {},
}));

/** Fire the menu item with the given label and return the message it posted. */
function fire(label: string, isPinned = false): unknown {
  const item = buildSessionMenuItems("sid", isPinned).find((i) => i.label === label);
  if (!item) throw new Error(`no menu item: ${label}`);
  item.onSelect();
  return post.mock.calls.at(-1)?.[0];
}

beforeEach(() => post.mockClear());

describe("buildSessionMenuItems", () => {
  it("lists all eight v1 actions when unpinned", () => {
    const labels = buildSessionMenuItems("sid", false).map((i) => i.label);
    expect(labels).toEqual([
      "Rename session",
      "Pin to top",
      "Fork & Resume",
      "Copy resume command",
      "Copy session ID",
      "Export session…",
      "Delete session",
    ]);
  });

  it("flips the pin row to Unpin when pinned", () => {
    expect(fire("Unpin", true)).toEqual({ type: "unpinSession", sessionId: "sid" });
  });

  it("Rename posts renameSession", () => {
    expect(fire("Rename session")).toEqual({ type: "renameSession", sessionId: "sid" });
  });

  it("Pin posts pinSession", () => {
    expect(fire("Pin to top")).toEqual({ type: "pinSession", sessionId: "sid" });
  });

  it("Fork & Resume posts forkSession", () => {
    expect(fire("Fork & Resume")).toEqual({ type: "forkSession", sessionId: "sid" });
  });

  it("Copy resume command posts copyCommand", () => {
    expect(fire("Copy resume command")).toEqual({ type: "copyCommand", sessionId: "sid" });
  });

  it("Export posts exportSession", () => {
    expect(fire("Export session…")).toEqual({ type: "exportSession", sessionId: "sid" });
  });

  it("Delete posts confirmDelete", () => {
    expect(fire("Delete session")).toEqual({ type: "confirmDelete", sessionId: "sid" });
  });

  it("Copy session ID writes to the clipboard, no host message", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const item = buildSessionMenuItems("sid", false).find((i) => i.label === "Copy session ID");
    item?.onSelect();
    expect(writeText).toHaveBeenCalledWith("sid");
    expect(post).not.toHaveBeenCalled();
  });

  it("flags Delete as danger", () => {
    const del = buildSessionMenuItems("sid", false).find((i) => i.label === "Delete session");
    expect(del?.danger).toBe(true);
  });
});
