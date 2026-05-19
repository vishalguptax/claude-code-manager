// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  createSessionItemNode,
  updateSessionItemNode,
} from "../components/sessionItem";
import type { Session } from "../../types";

function mkSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    name: "",
    project: "demo",
    projectPath: "/demo",
    branch: "",
    entrypoint: "",
    startTime: 0,
    endTime: Date.now(),
    messageCount: 1,
    summary: "hello",
    prompts: ["hello"],
    projectKey: "demo",
    searchHaystack: "demo",
    ...overrides,
  };
}

function liveDot(node: HTMLElement): HTMLElement {
  return node.querySelector(".live-dot") as HTMLElement;
}

describe("sessionItem live-dot rendering", () => {
  let node: HTMLElement;

  beforeEach(() => {
    node = createSessionItemNode(mkSession());
  });

  it("hides the dot and sets no status attribute when not live", () => {
    updateSessionItemNode(node, mkSession({ isLive: false }), false, false, false);
    const dot = liveDot(node);
    expect(dot.style.display).toBe("none");
    expect(dot.dataset.status).toBeUndefined();
  });

  it("shows the dot with the CLI status as a data attribute when live", () => {
    updateSessionItemNode(
      node,
      mkSession({ isLive: true, status: "busy" }),
      false,
      false,
      false,
    );
    const dot = liveDot(node);
    expect(dot.style.display).not.toBe("none");
    expect(dot.dataset.status).toBe("busy");
    expect(dot.title).toBe("Session is busy");
  });

  it("maps known awaiting-permission strings to a friendly tooltip", () => {
    updateSessionItemNode(
      node,
      mkSession({ isLive: true, status: "awaiting_permission" }),
      false,
      false,
      false,
    );
    expect(liveDot(node).title).toBe("Awaiting permission");
  });

  it("passes unknown status strings through to the data attribute", () => {
    updateSessionItemNode(
      node,
      mkSession({ isLive: true, status: "future-state" }),
      false,
      false,
      false,
    );
    const dot = liveDot(node);
    expect(dot.dataset.status).toBe("future-state");
    expect(dot.title).toBe("Session: future-state");
  });

  it("clears the status data attribute when the session goes from live to dead", () => {
    updateSessionItemNode(
      node,
      mkSession({ isLive: true, status: "busy" }),
      false,
      false,
      false,
    );
    updateSessionItemNode(node, mkSession({ isLive: false }), false, false, false);
    const dot = liveDot(node);
    expect(dot.style.display).toBe("none");
    expect(dot.dataset.status).toBeUndefined();
  });

  it("falls back to the generic title when live with no status field", () => {
    updateSessionItemNode(node, mkSession({ isLive: true }), false, false, false);
    expect(liveDot(node).title).toBe("Session is live");
  });
});
