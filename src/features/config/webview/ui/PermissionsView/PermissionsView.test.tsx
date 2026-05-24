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

  it("the search box is the shared SearchInput (vscode-textfield), not a raw input", () => {
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
    expect(container.querySelector('vscode-textfield[aria-label="Search tools"]')).toBeTruthy();
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
    expect(container.querySelector(".acct-scope-toggle")).toBeTruthy();
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
    fireEvent.click(container.querySelector(".acct-perm-remove") as HTMLButtonElement);
    expect(post).toHaveBeenCalledWith({
      type: "promptRemovePermission",
      scope: "global",
      tool: "Bash(git:*)",
      list: "allow",
    });
  });
});
