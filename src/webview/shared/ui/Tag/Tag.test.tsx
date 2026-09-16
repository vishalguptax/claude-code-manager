// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("defaults to the neutral pill with no modifiers", () => {
    const { container } = render(<Tag text="feat/x" />);
    const el = container.querySelector("span.tag") as HTMLElement;
    expect(el.className.trim()).toBe("tag");
    expect(el.textContent).toBe("feat/x");
  });

  it("always wraps the label so it can ellipsize", () => {
    // A chip is a flex container and `text-overflow: ellipsis` does not apply
    // to an anonymous flex item — bare text clips mid-word. The Skills tab
    // rendered bare text for exactly this reason before the component existed.
    const { container } = render(<Tag text="a-very-long-keyword" />);
    expect(container.querySelector(".tag .tag-text")?.textContent).toBe("a-very-long-keyword");
  });

  it("renders a leading glyph when asked", () => {
    const { container } = render(<Tag text="main" icon="git-branch" />);
    expect(container.querySelector('[data-icon="git-branch"]')).toBeTruthy();
  });

  it("marks the folder and temp variants", () => {
    expect(
      render(<Tag variant="folder" text="repo" />).container.querySelector(".tag.folder"),
    ).toBeTruthy();
    expect(
      render(<Tag variant="temp" text="Temp" />).container.querySelector(".tag.tag-temp"),
    ).toBeTruthy();
  });

  it("composes the worktree pill from its tone and state", () => {
    const { container } = render(
      <Tag variant="worktree" tone="claude" text="cm-quota" detail="feat/q" locked />,
    );
    const el = container.querySelector(".tag") as HTMLElement;
    expect(el.classList.contains("tag-wt")).toBe(true);
    expect(el.classList.contains("tag-wt--claude")).toBe(true);
    expect(el.classList.contains("tag-wt--locked")).toBe(true);
    expect(container.querySelector(".tag-wt__name")?.textContent).toBe("cm-quota");
    expect(container.querySelector(".tag-wt__branch")?.textContent).toBe("feat/q");
  });

  it("does not stack the lock ring on a worktree that is already gone", () => {
    // Struck-through AND ringed reads as two states at once; missing is the
    // louder claim and wins.
    const { container } = render(
      <Tag variant="worktree" tone="user" text="gone" missing locked />,
    );
    const el = container.querySelector(".tag") as HTMLElement;
    expect(el.classList.contains("tag-wt--missing")).toBe(true);
    expect(el.classList.contains("tag-wt--locked")).toBe(false);
  });

  it("ignores worktree-only state on other variants", () => {
    const { container } = render(<Tag text="main" missing locked tone="claude" />);
    const el = container.querySelector(".tag") as HTMLElement;
    expect(el.className.trim()).toBe("tag");
  });

  it("passes through a title and extra classes", () => {
    const { container } = render(<Tag text="x" title="the full value" class="extra" />);
    const el = container.querySelector(".tag") as HTMLElement;
    expect(el.getAttribute("title")).toBe("the full value");
    expect(el.classList.contains("extra")).toBe(true);
  });
});
