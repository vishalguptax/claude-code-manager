// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/preact";
import { Section, SectionHeader } from "./Section";

describe("SectionHeader", () => {
  it("renders the title and tags the header with its id", () => {
    const { container } = render(<SectionHeader id="quota" title="Quota" />);
    expect(screen.getByText("Quota")).toBeTruthy();
    expect(container.querySelector('[data-section="quota"]')).toBeTruthy();
  });

  // A header that cannot collapse must not claim it can. Announcing
  // role="button" and aria-expanded on a static heading tells a screen-reader
  // user there is something to toggle, and nothing happens when they try.
  it("is a plain heading when it cannot collapse", () => {
    const { container } = render(<SectionHeader id="perms" title="Permissions" />);
    const head = container.querySelector(".section-header");
    expect(head?.getAttribute("role")).toBeNull();
    expect(head?.getAttribute("aria-expanded")).toBeNull();
    expect(head?.hasAttribute("tabindex")).toBe(false);
  });

  it("becomes a button once it can collapse", () => {
    const { container } = render(
      <SectionHeader id="usage" title="Usage" collapsed={false} onToggle={() => {}} />,
    );
    const head = container.querySelector(".section-header");
    expect(head?.getAttribute("role")).toBe("button");
    expect(head?.getAttribute("aria-expanded")).toBe("true");
    expect(head?.getAttribute("tabindex")).toBe("0");
  });

  it("reports collapsed through aria-expanded and rotates the chevron", () => {
    const { container } = render(
      <SectionHeader id="usage" title="Usage" collapsed onToggle={() => {}} />,
    );
    expect(container.querySelector(".section-header")?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".section-chevron.collapsed")).toBeTruthy();
  });

  it("toggles on click and on Enter and Space", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SectionHeader id="usage" title="Usage" collapsed={false} onToggle={onToggle} />,
    );
    const head = container.querySelector(".section-header") as HTMLElement;
    fireEvent.click(head);
    fireEvent.keyDown(head, { key: "Enter" });
    fireEvent.keyDown(head, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle).toHaveBeenCalledWith("usage");
  });

  it("ignores other keys", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <SectionHeader id="usage" title="Usage" collapsed={false} onToggle={onToggle} />,
    );
    fireEvent.keyDown(container.querySelector(".section-header") as HTMLElement, { key: "a" });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("renders trailing header content", () => {
    render(
      <SectionHeader id="quota" title="Quota">
        <span>live</span>
      </SectionHeader>,
    );
    expect(screen.getByText("live")).toBeTruthy();
  });

  // The chevron IS the collapse affordance, so a static section may show a
  // topical icon in that slot instead; a collapsible one never shows both.
  it("shows an icon only when there is no chevron", () => {
    const { container: plain } = render(<SectionHeader id="p" title="P" icon="shield" />);
    expect(plain.querySelector(".section-icon")).toBeTruthy();
    expect(plain.querySelector(".section-chevron")).toBeNull();

    const { container: collapsible } = render(
      <SectionHeader id="p" title="P" icon="shield" collapsed={false} onToggle={() => {}} />,
    );
    expect(collapsible.querySelector(".section-chevron")).toBeTruthy();
    expect(collapsible.querySelector(".section-icon")).toBeNull();
  });
});

describe("Section", () => {
  it("renders its body when open", () => {
    render(
      <Section id="usage" title="Usage" collapsed={false} onToggle={() => {}}>
        <p>body</p>
      </Section>,
    );
    expect(screen.getByText("body")).toBeTruthy();
  });

  // Collapsing DROPS the body rather than hiding it, so a collapsed Account
  // section costs nothing to keep mounted.
  it("drops the body when collapsed", () => {
    const { container } = render(
      <Section id="usage" title="Usage" collapsed onToggle={() => {}}>
        <p>body</p>
      </Section>,
    );
    expect(container.querySelector(".section-body")).toBeNull();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("renders a non-collapsible section's body", () => {
    const { container } = render(
      <Section id="perms" title="Permissions">
        <p>body</p>
      </Section>,
    );
    expect(container.querySelector(".section-body")).toBeTruthy();
  });

  it("puts header actions in the header, not the body", () => {
    const { container } = render(
      <Section id="quota" title="Quota" headerActions={<button type="button">Refresh</button>}>
        <p>body</p>
      </Section>,
    );
    expect(container.querySelector(".section-header button")).toBeTruthy();
    expect(container.querySelector(".section-body button")).toBeNull();
  });
});
