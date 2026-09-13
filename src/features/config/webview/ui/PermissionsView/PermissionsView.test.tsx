// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { createConfigApi } from "../../api";
import { makeConfigData } from "../../__tests__/fixtures";
import { PermissionsView } from "./PermissionsView";

function setup(post = vi.fn()) {
  return { api: createConfigApi(post), post };
}

describe("PermissionsView", () => {
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

  it("the search box is the shared SearchInput (native input), labelled for tools", () => {
    const { api } = setup();
    const { container } = render(
      <PermissionsView
        data={makeConfigData()}
        api={api}
        scope="global"
        search=""
        onScopeChange={vi.fn()}
        onSearchChange={vi.fn()}
      />,
    );
    expect(container.querySelector('input[aria-label="Search tools"]')).toBeTruthy();
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
    // The scope segmented still renders (Global only — no project scope present).
    // The scope segments sit directly in the section body, which is what zeroes
    // their panel-edge inset (see components.css). No wrapper class needed.
    expect(container.querySelector(".section-body > .vsc-segmented")).toBeTruthy();
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
});
