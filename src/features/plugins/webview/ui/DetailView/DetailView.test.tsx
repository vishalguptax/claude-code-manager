// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { blocked, orphaned, overridden, plugin } from "../../__tests__/fixtures";
import { DetailView } from "./DetailView";

function renderDetail(entry = plugin()) {
  const onBack = vi.fn();
  const onToggle = vi.fn();
  const onOpenDirectory = vi.fn();
  const onCopyId = vi.fn();
  const onOpenSettings = vi.fn();
  const result = render(
    <DetailView
      plugin={entry}
      onBack={onBack}
      onToggle={onToggle}
      onOpenDirectory={onOpenDirectory}
      onCopyId={onCopyId}
      onOpenSettings={onOpenSettings}
    />,
  );
  return { ...result, onBack, onToggle, onOpenDirectory, onCopyId, onOpenSettings };
}

describe("DetailView", () => {
  it("roots the view in the shared scrolling panel", () => {
    const { container } = renderDetail();
    expect((container.firstElementChild as HTMLElement).classList.contains("panel")).toBe(true);
  });

  it("returns to the list through the shared back button", () => {
    const { container, onBack } = renderDetail();
    const back = container.querySelector(".back-btn") as HTMLElement;
    expect(back.textContent).toContain("Back");
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalled();
  });

  it("heads the panel with the name and its state chips", () => {
    const { container } = renderDetail();
    expect(container.querySelector(".d-title")?.textContent).toBe("caveman");
    expect(screen.getByText("enabled")).toBeTruthy();
    expect(container.querySelector(".vsc-badge--scope-global")?.textContent).toBe("user");
  });

  it("lists the install facts a row has no room for", () => {
    renderDetail();
    expect(screen.getByText("caveman@caveman")).toBeTruthy();
    expect(screen.getByText("0d95a81d35a9")).toBeTruthy();
    expect(
      screen.getByText("/home/dev/.claude/plugins/cache/caveman/caveman/0d95a81d35a9"),
    ).toBeTruthy();
  });

  it("skips a fact the parser had no value for", () => {
    // An orphan has no install path, version or install scope; printing empty
    // rows would read as a rendering fault.
    const { container } = renderDetail(orphaned);
    const keys = [...container.querySelectorAll(".d-k")].map((k) => k.textContent);
    expect(keys).toEqual(["Id", "From"]);
  });

  it("offers the actions as shared buttons", () => {
    const { onToggle, onOpenDirectory, onCopyId } = renderDetail();
    fireEvent.click(screen.getByText("Disable"));
    fireEvent.click(screen.getByText("Open folder"));
    fireEvent.click(screen.getByText("Copy id"));
    expect(onToggle).toHaveBeenCalledWith(plugin());
    expect(onOpenDirectory).toHaveBeenCalledWith("caveman@caveman");
    expect(onCopyId).toHaveBeenCalledWith("caveman@caveman");
  });

  it("has no folder to open for a plugin with no install", () => {
    renderDetail(orphaned);
    expect(screen.queryByText("Open folder")).toBeNull();
  });

  it("explains a missing switch quietly instead of just hiding it", () => {
    renderDetail(blocked);
    expect(screen.queryByText("Enable")).toBeNull();
    const note = screen.getByRole("note");
    expect(note.classList.contains("plg-note")).toBe(true);
    expect(note.textContent).toContain("blocklist");
  });

  it("says nothing extra when the plugin can be switched", () => {
    renderDetail();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("shows the full override chain with the winning file marked", () => {
    const { container } = renderDetail(overridden);
    const chips = [...container.querySelectorAll(".plg-chain-tag")];
    expect(chips.map((c) => c.textContent)).toEqual([
      "user: on",
      "project: off",
      "local: on",
    ]);
    expect(chips[2].classList.contains("is-winner")).toBe(true);
  });

  it("offers every settings file as a peer, not just the winning one", () => {
    const { onOpenSettings } = renderDetail();
    for (const label of ["user", "project", "local"]) {
      fireEvent.click(screen.getByTitle(`Open ${label} settings.json`));
    }
    expect(onOpenSettings.mock.calls.map((c) => c[0])).toEqual([
      "global",
      "project",
      "local",
    ]);
  });

  it("shows a configured plugin's config in the shared code block", () => {
    const { container } = renderDetail(plugin({ config: { model: "opus" } }));
    const pre = container.querySelector("pre.d-pre") as HTMLElement;
    expect(pre.textContent).toContain('"model": "opus"');
  });

  it("omits the configuration section when no scope configures the plugin", () => {
    const { container } = renderDetail();
    expect(container.querySelector("pre.d-pre")).toBeNull();
  });
});
