// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("renders the description when provided", () => {
    render(<EmptyState title="t" description="check back later" />);
    expect(screen.getByText("check back later")).toBeTruthy();
  });

  it("omits the description node entirely when there is none", () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector(".empty-state-desc")).toBeNull();
  });

  // Every one of these descriptions explains a file format, so they need to
  // set a path or a key as <code> mid-sentence. A string-only prop is what
  // pushed four features into writing their own empty state instead.
  it("accepts nodes in the description, not only a string", () => {
    const { container } = render(
      <EmptyState
        title="No hooks"
        description={
          <>
            They live in <code>settings.json</code>.
          </>
        }
      />,
    );
    const desc = container.querySelector(".empty-state-desc");
    expect(desc?.querySelector("code")?.textContent).toBe("settings.json");
    expect(desc?.textContent).toBe("They live in settings.json.");
  });

  it("renders an action passed as children", () => {
    render(
      <EmptyState title="t">
        <button type="button">Add one</button>
      </EmptyState>,
    );
    expect(screen.getByText("Add one")).toBeTruthy();
  });

  it("renders the icon when given one", () => {
    const { container } = render(<EmptyState title="t" icon="inbox" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  // ── Compact ─────────────────────────────────────────────────────────
  // The in-section variant, for a block that is empty inside an otherwise
  // populated panel (Account's Profile and Usage sections).

  it("adds the compact modifier so the section variant can be styled", () => {
    const { container } = render(<EmptyState title="t" compact />);
    expect(container.querySelector(".empty-state--compact")).toBeTruthy();
  });

  it("is not compact by default", () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector(".empty-state--compact")).toBeNull();
  });

  // A 32px glyph inside a section between other content reads as decoration
  // competing with the section heading, so compact drops it even if asked.
  it("suppresses the icon in the compact variant", () => {
    const { container } = render(<EmptyState title="t" icon="inbox" compact />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("announces a waiting state to assistive tech when asked", () => {
    const { container } = render(<EmptyState title="Indexing…" role="status" />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("sets no role by default, since a steady empty state is not an alert", () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector(".empty-state")?.hasAttribute("role")).toBe(false);
  });
});
