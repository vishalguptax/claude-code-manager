// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { _resetConfigState } from "../../model";
import { infoFor, toggle } from "../../__tests__/dom";
import { makeConfigData } from "../../__tests__/fixtures";
import { PermissionsView } from "./PermissionsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("PermissionsView", () => {
  // Open by default: it is one of the two sections people come for.
  beforeEach(() => _resetConfigState());

  it("shows project/local scope segments and fires onScopeChange", () => {
    const onScopeChange = vi.fn();
    const data = makeConfigData({
      permissions: [
        { scope: "global", allow: ["Read"], deny: [] },
        { scope: "project", allow: ["Bash(ls:*)"], deny: ["Bash(rm:*)"] },
      ],
      settings: { ...makeConfigData().settings, additionalDirectories: ["/tmp/extra"] },
    });
    const { api } = setup();
    render(
      <PermissionsView
        data={data}
        api={api}
        scope="global"
        search=""
        onScopeChange={onScopeChange}
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Project"));
    expect(onScopeChange).toHaveBeenCalledWith("project");
    // Additional directory row renders.
    expect(screen.getByText("/tmp/extra")).toBeTruthy();
  });

  it("filters the allow list by the search query", () => {
    const data = makeConfigData({
      permissions: [{ scope: "global", allow: ["Read", "Write", "Bash(git:*)"], deny: [] }],
    });
    const { api } = setup();
    render(
      <PermissionsView
        data={data}
        api={api}
        scope="global"
        search="git"
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Bash(git:*)")).toBeTruthy();
    expect(screen.queryByText("Write")).toBeNull();
  });

  // A search box over two rules is a control with nothing to do.
  it("offers search only once there are more rules than fit at a glance", () => {
    const few = renderWithAllow(["Read", "Write"]);
    expect(few.container.querySelector('input[aria-label="Search permission rules"]')).toBeNull();
    few.unmount();

    const many = renderWithAllow(Array.from({ length: 8 }, (_, i) => `Bash(c${i}:*)`));
    expect(many.container.querySelector('input[aria-label="Search permission rules"]')).toBeTruthy();
  });

  it("keeps the search box while a query is active, so it can be cleared", () => {
    const { container } = renderWithAllow(["Read"], "zzz");
    expect(container.querySelector('input[aria-label="Search permission rules"]')).toBeTruthy();
  });

  it("renders the empty state (no crash) when the payload omits permissions", () => {
    // A partial/legacy accountData payload could arrive without a permissions
    // array (it crosses the host boundary as `unknown`). The view must default
    // to empty and render the "No … tools" states rather than throwing on
    // `.find` of undefined, which would blank the whole section and look like a
    // genuinely-empty permissions list.
    const data = makeConfigData();
    // Force the degraded shape the runtime guard protects against.
    (data as unknown as { permissions?: unknown }).permissions = undefined;
    const { api } = setup();
    const { container } = render(
      <PermissionsView
        data={data}
        api={api}
        scope="global"
        search=""
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Permissions")).toBeTruthy();
    expect(screen.getByText("No allowed tools")).toBeTruthy();
    expect(screen.getByText("No denied tools")).toBeTruthy();
    // The scope segmented still renders (Global only, no project scope), inside
    // the section body, where components.css zeroes its panel-edge inset.
    expect(container.querySelector(".section-body .cfg-rules .vsc-segmented")).toBeTruthy();
  });

  it("removing a tool posts promptRemovePermission", () => {
    const data = makeConfigData({
      permissions: [{ scope: "global", allow: ["Bash(git:*)"], deny: [] }],
    });
    const { api, post } = setup();
    const { container } = render(
      <PermissionsView
        data={data}
        api={api}
        scope="global"
        search=""
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    fireEvent.click(container.querySelector(".cfg-perm-remove") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({
      type: "promptRemovePermission",
      scope: "global",
      tool: "Bash(git:*)",
      list: "allow",
    });
  });

  // ── Progressive disclosure ──────────────────────────────────────────
  // A real global allow-list runs to sixty-odd patterns, one per row, which
  // pushed Settings history and Backup past three screenfuls — the sections
  // below became effectively undiscoverable.

  function renderWithAllow(allow: string[], search = "") {
    const { api } = setup();
    return render(
      <PermissionsView
        data={makeConfigData({ permissions: [{ scope: "global", allow, deny: [] }] })}
        api={api}
        scope="global"
        search={search}
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
  }

  it("shows a head of the list and discloses the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Bash(cmd${i}:*)`);
    const { container } = renderWithAllow(many);
    expect(container.querySelectorAll(".cfg-perm-row").length).toBe(6);
    fireEvent.click(screen.getByText("Show 14 more patterns"));
    expect(container.querySelectorAll(".cfg-perm-row").length).toBe(20);
  });

  it("does not collapse a list that already fits", () => {
    const { container } = renderWithAllow(["Bash(a:*)", "Bash(b:*)"]);
    expect(container.querySelector(".show-more")).toBeNull();
  });

  // A search is already a narrowing; hiding its results behind a second
  // disclosure would mean typing a query and still not seeing the match.
  it("shows every match while searching, with no disclosure", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Bash(cmd${i}:*)`);
    const { container } = renderWithAllow(many, "cmd1");
    // cmd1 plus cmd10..cmd19 — all of them, not the first six.
    expect(container.querySelectorAll(".cfg-perm-row").length).toBe(11);
    expect(container.querySelector(".show-more")).toBeNull();
  });
  it("starts open and folds and unfolds from its header", () => {
    _resetConfigState();
    const data = makeConfigData({
      permissions: [{ scope: "global", allow: ["Read"], deny: [] }],
    });
    const { api } = setup();
    render(
      <PermissionsView
        data={data}
        api={api}
        scope="global"
        search=""
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Read")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^permissions/i }));
    expect(screen.queryByText("Read")).toBeNull();
    // The header itself survives, so the section can be opened again.
    fireEvent.click(screen.getByRole("button", { name: /^permissions/i }));
    expect(screen.getByText("Read")).toBeTruthy();
    _resetConfigState();
  });

  // ── The global mode and switches, merged in from Settings ───────────

  function renderDefault(post = vi.fn()) {
    const { api } = setup(post);
    const view = render(
      <PermissionsView
        data={makeConfigData()}
        api={api}
        scope="project"
        search=""
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    return { ...view, post };
  }

  it("leads with the tool-use mode, its meaning behind an InfoTip", () => {
    const { container } = renderDefault();
    expect(container.querySelector('.vsc-dropdown-trigger[aria-label="Tool-use confirmation"]')).toBeTruthy();
    expect(infoFor(container, "Tool-use confirmation")).toBeTruthy();
  });

  it("writes the nested sandbox and permission keys by dotted path", () => {
    const { container, post } = renderDefault();
    fireEvent.click(toggle(container, "Sandbox Bash commands"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "sandbox.enabled",
      value: true,
      scope: "global",
    });
    fireEvent.click(toggle(container, "Block bypass-permissions mode"));
    expect(post).toHaveBeenCalledWith({
      type: "setSetting",
      key: "permissions.disableBypassPermissionsMode",
      value: true,
      scope: "global",
    });
  });

  // ── Adding sits with the list it adds to ────────────────────────────

  it("adds an allowed or denied tool from that list's own heading, at the shown scope", () => {
    const { post } = renderDefault();
    fireEvent.click(screen.getByLabelText("Add allowed tool"));
    expect(post).toHaveBeenCalledWith({ type: "promptAddPermission", scope: "project", list: "allow" });
    fireEvent.click(screen.getByLabelText("Add denied tool"));
    expect(post).toHaveBeenCalledWith({ type: "promptAddPermission", scope: "project", list: "deny" });
  });

  it("adds a directory from its heading", () => {
    const { post } = renderDefault();
    fireEvent.click(screen.getByLabelText("Add directory"));
    expect(post).toHaveBeenCalledWith({ type: "promptAddDirectory" });
  });

  it("opens the shown scope's settings.json from the header without folding the section", () => {
    const { post } = renderDefault();
    fireEvent.click(screen.getByLabelText("Open the project settings.json"));
    expect(post).toHaveBeenCalledWith({ type: "openSettingsFile", scope: "project" });
    // Still open: the click did not fall through to the header toggle.
    expect(screen.getByText("Allowed")).toBeTruthy();
  });

  // The pattern format now lives in the add prompt, where it is used.
  it("no longer carries the pattern-format paragraph", () => {
    renderDefault();
    expect(screen.queryByText(/Pattern format/)).toBeNull();
  });
});
