// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render } from "@testing-library/preact";
import type { Message } from "../../types";
import { MessageItem, fmtTokens, splitHighlight } from "../components/MessageItem";

function message(over: Partial<Message> = {}): Message {
  return { role: "user", content: "hello world", timestamp: "", ...over };
}

const noop = () => {};

function renderMsg(m: Message, props: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  return render(
    h(MessageItem, {
      message: m,
      index: 0,
      query: "",
      onCopy: noop,
      onAskAgain: noop,
      copied: false,
      ...props,
    }),
  );
}

describe("fmtTokens", () => {
  it("formats across scales", () => {
    expect(fmtTokens(980)).toBe("980");
    expect(fmtTokens(1200)).toBe("1.2k");
    expect(fmtTokens(10_582)).toBe("10.6k");
    expect(fmtTokens(1_500_000)).toBe("1.5M");
    expect(fmtTokens(2_755_200_000)).toBe("2.76B");
  });
});

describe("splitHighlight", () => {
  it("returns one segment when there is no query", () => {
    expect(splitHighlight("abc", "")).toEqual([{ text: "abc", match: false }]);
  });

  it("splits matches case-insensitively", () => {
    expect(splitHighlight("Refactor the parser", "parser")).toEqual([
      { text: "Refactor the ", match: false },
      { text: "parser", match: true },
    ]);
  });

  it("handles multiple matches", () => {
    const out = splitHighlight("a x a x a", "x");
    expect(out.filter((s) => s.match)).toHaveLength(2);
  });
});

describe("MessageItem", () => {
  it("renders user role label", () => {
    const { getByText } = renderMsg(message({ role: "user" }));
    expect(getByText("You")).toBeTruthy();
  });

  it("renders assistant role label", () => {
    const { getByText } = renderMsg(message({ role: "assistant", content: "hi" }));
    expect(getByText("Claude")).toBeTruthy();
  });

  it("truncates long content when not searching", () => {
    const { container } = renderMsg(message({ content: "a".repeat(600) }));
    const text = container.querySelector(".d-msg-content")?.textContent ?? "";
    expect(text.endsWith("…")).toBe(true);
    expect(text.length).toBeLessThan(550);
  });

  it("highlights the query inside content", () => {
    const { container } = renderMsg(message({ content: "fix the parser now" }), { query: "parser" });
    expect(container.querySelector("mark.d-match")?.textContent).toBe("parser");
  });

  it("renders tool-use rows", () => {
    const { container } = renderMsg(
      message({ role: "assistant", content: "", toolUses: [{ name: "Read", arg: "/x.ts" }] }),
    );
    expect(container.querySelector(".d-msg-tool-name")?.textContent).toBe("Read");
    expect(container.querySelector(".d-msg-tool-arg")?.textContent).toBe("/x.ts");
  });

  it("renders a thinking block, expanded when the query matches", () => {
    const { container } = renderMsg(
      message({ role: "assistant", thinking: "secret plan here", content: "" }),
      { query: "plan" },
    );
    const details = container.querySelector("details.d-msg-thinking") as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(true);
  });

  it("renders a usage stamp from token counts", () => {
    const { container } = renderMsg(
      message({ role: "assistant", content: "x", usage: { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 } }),
    );
    const usage = container.querySelector(".d-msg-usage")?.textContent ?? "";
    expect(usage).toContain("50 out");
    expect(usage).toContain("100 in");
  });

  it("fires onCopy with the message index", () => {
    const onCopy = vi.fn();
    const { container } = renderMsg(message(), { onCopy });
    fireEvent.click(container.querySelector('.d-msg-action[aria-label="Copy message"]') as Element);
    expect(onCopy).toHaveBeenCalledWith(0);
  });

  it("shows ask-again only for user messages", () => {
    const { container: user } = renderMsg(message({ role: "user" }));
    expect(user.querySelector('[aria-label="Ask again"]')).toBeTruthy();
    const { container: asst } = renderMsg(message({ role: "assistant", content: "x" }));
    expect(asst.querySelector('[aria-label="Ask again"]')).toBeNull();
  });
});
