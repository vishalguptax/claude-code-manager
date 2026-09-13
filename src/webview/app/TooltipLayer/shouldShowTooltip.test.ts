// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { isTextTruncated, shouldShowTooltip } from "./shouldShowTooltip";

/**
 * happy-dom reports every width as 0, so truncation is simulated by defining
 * scrollWidth/clientWidth directly — the same two numbers the real check reads.
 */
function el(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

function size(node: HTMLElement, scroll: number, client: number): void {
  Object.defineProperty(node, "scrollWidth", { value: scroll, configurable: true });
  Object.defineProperty(node, "clientWidth", { value: client, configurable: true });
}

describe("shouldShowTooltip", () => {
  let node: HTMLElement;

  beforeEach(() => {
    node = el("<span>Refuse to rewrite unparsable hook configs</span>");
    size(node, 100, 100);
  });

  it("suppresses a title that repeats fully-visible text", () => {
    // The reason this exists: hovering a session row's title used to pop a box
    // containing the title the user was already reading.
    expect(shouldShowTooltip(node, "Refuse to rewrite unparsable hook configs")).toBe(false);
  });

  it("ignores case and whitespace when comparing", () => {
    expect(shouldShowTooltip(node, "  refuse to rewrite   unparsable hook configs ")).toBe(false);
  });

  it("shows when the same text is clipped", () => {
    size(node, 260, 100);
    expect(shouldShowTooltip(node, "Refuse to rewrite unparsable hook configs")).toBe(true);
  });

  it("shows when the label lives in a child that is clipped", () => {
    // Chips put their label in a child span; the chip itself is sized to fit,
    // so only the child overflows.
    const chip = el('<span class="tag"><svg></svg><span>feat/sidebar-shell</span></span>');
    size(chip, 120, 120);
    size(chip.children[1] as HTMLElement, 180, 90);
    expect(shouldShowTooltip(chip, "feat/sidebar-shell-redesign")).toBe(true);
  });

  it("always shows for an icon-only control", () => {
    const btn = el('<button title="Refresh"><svg></svg></button>');
    size(btn, 24, 24);
    expect(shouldShowTooltip(btn, "Refresh sessions")).toBe(true);
  });

  it("shows a title that explains rather than restates", () => {
    const btn = el("<button>New Session</button>");
    size(btn, 100, 100);
    expect(shouldShowTooltip(btn, "Start a new Claude Code session in a fresh terminal")).toBe(
      true,
    );
  });

  it("suppresses a title that is merely a prefix of the visible text", () => {
    const chip = el("<span>Project (13)</span>");
    size(chip, 80, 80);
    expect(shouldShowTooltip(chip, "Project")).toBe(false);
  });

  it("suppresses an empty title", () => {
    expect(shouldShowTooltip(node, "   ")).toBe(false);
  });
});

describe("isTextTruncated", () => {
  it("is false when the content fits", () => {
    const node = el("<span>short</span>");
    size(node, 40, 40);
    expect(isTextTruncated(node)).toBe(false);
  });

  it("allows a single pixel of slack for sub-pixel rounding", () => {
    const node = el("<span>short</span>");
    size(node, 41, 40);
    expect(isTextTruncated(node)).toBe(false);
    size(node, 44, 40);
    expect(isTextTruncated(node)).toBe(true);
  });
});
