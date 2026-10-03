// @vitest-environment happy-dom
import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus } from "../../../../webview/shared/model";
import ConfigTab, { handleConfigMessage } from "../index";
import { _resetConfigState, configData, configError, loading } from "../model";
import { makeConfigData } from "./fixtures";

describe("ConfigTab", () => {
  let post: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _resetConfigState();
    _resetMessageBus();
    post = vi.fn();
    setVscodeApi({ postMessage: post });
  });
  afterEach(() => setVscodeApi(null));

  it("requests data on mount and shows loading", () => {
    const { container } = render(<ConfigTab />);
    expect(post).toHaveBeenCalledWith({ type: "getAccountData" });
    expect(container.querySelector(".skeleton-field")).toBeTruthy();
  });

  it("requests data exactly once, even as the reply re-renders it", async () => {
    // Regression: `useApi()` used to return a fresh object per render,
    // so the mount effect's dep array changed every render. The host
    // reply set a signal, that re-rendered, the effect re-ran and
    // re-requested — an unbounded request loop that held the global
    // busy bar on for as long as the tab stayed mounted (which is
    // forever: TabPanel keeps tabs alive).
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Model & reasoning")).toBeTruthy());
    configData.value = makeConfigData();
    await waitFor(() => expect(screen.getByText("Model & reasoning")).toBeTruthy());

    const requests = post.mock.calls.filter(
      ([m]) => (m as { type: string }).type === "getAccountData",
    );
    expect(requests).toHaveLength(1);
  });

  // One section per question, in order of how often people come for them.
  it("renders every section, in order, once data arrives", async () => {
    const { container } = render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Model & reasoning")).toBeTruthy());
    const titles = Array.from(container.querySelectorAll(".section-title")).map((t) => t.textContent);
    expect(titles).toEqual([
      "Model & reasoning",
      "Permissions",
      "Sessions & context",
      "Git & attribution",
      "Interface",
      "Sidebar tabs",
      "History & recovery",
      "Backup & tools",
    ]);
  });

  it("says once, at the top, when changes take effect", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() =>
      expect(screen.getAllByText("Changes apply to new Claude sessions.")).toHaveLength(1),
    );
  });

  it("shows the empty state when not loading and no data", async () => {
    render(<ConfigTab />);
    loading.value = false;
    configData.value = null;
    await waitFor(() => expect(screen.getByText(/No config available/)).toBeTruthy());
  });

  it("shows a host error when no data loaded", async () => {
    render(<ConfigTab />);
    configError.value = "host blew up";
    await waitFor(() => expect(screen.getByText("host blew up")).toBeTruthy());
  });

  it("wires the folded History section to the api (reset posts resetSettings)", async () => {
    // Integration check that the sections receive a live api. Per-control
    // wiring is covered by each section's own test; here a plain Button
    // action proves the tab hands the api down.
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("History & recovery")).toBeTruthy());
    fireEvent.click(screen.getByText("History & recovery"));
    fireEvent.click(screen.getByText("Reset settings.json"));
    expect(post).toHaveBeenCalledWith({ type: "resetSettings", scope: "global" });
  });

  it("renders allow/deny tools and posts a remove on click", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    // Permissions opens expanded.
    await waitFor(() => expect(screen.getByText("Bash(git:*)")).toBeTruthy());
    const removeBtn = document.querySelector(".cfg-perm-remove") as HTMLButtonElement;
    fireEvent.click(removeBtn);
    expect(
      post.mock.calls.some((c) => c[0]?.type === "promptRemovePermission"),
    ).toBe(true);
  });

  it("posts a brain export command from the Backup section", async () => {
    render(<ConfigTab />);
    configData.value = makeConfigData();
    loading.value = false;
    await waitFor(() => expect(screen.getByText("Backup & tools")).toBeTruthy());
    // Folded by default: the Export button appears once the section opens.
    expect(screen.queryByText("Export brain…")).toBeNull();
    fireEvent.click(screen.getByText("Backup & tools"));
    fireEvent.click(screen.getByText("Export brain…"));
    expect(post).toHaveBeenCalledWith({ type: "runCommand", command: "claudeManager.exportBrain" });
  });

  it("handleConfigMessage applies accountData and error", () => {
    handleConfigMessage({ type: "accountData", data: makeConfigData() });
    expect(configData.value?.profile.email).toBe("u@x.com");
    expect(loading.value).toBe(false);
    handleConfigMessage({ type: "error", message: "nope" });
    expect(configError.value).toBe("nope");
  });
});
