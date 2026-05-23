// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import { _resetMessageBus, dispatch } from "../../../../webview/shared/model";
import type { McpServer } from "../../types";
import { resetMcpSignals } from "../model";
import McpTab from "../index";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

let posted: unknown[] = [];

beforeEach(() => {
  posted = [];
  setVscodeApi({ postMessage: (m) => posted.push(m) });
  _resetMessageBus();
  resetMcpSignals();
});

afterEach(() => {
  setVscodeApi(null);
  _resetMessageBus();
  resetMcpSignals();
});

describe("McpTab", () => {
  it("requests the server list on mount", () => {
    render(h(McpTab, {}));
    expect(posted).toContainEqual({ type: "getMcpServers" });
  });

  it("renders servers received over the message bus", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [srv({ name: "files", scope: "project" })] });
    await waitFor(() => expect(screen.getByText("files")).toBeTruthy());
  });

  it("navigates to the detail view and back", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [srv({ name: "files", scope: "project" })] });
    await waitFor(() => screen.getByText("files"));
    fireEvent.click(screen.getByText("files"));
    await waitFor(() => expect(screen.getByText("Connection")).toBeTruthy());
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => expect(screen.getByText("files")).toBeTruthy());
  });

  it("sends a toggle message from the detail view", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [srv({ name: "files", scope: "project" })] });
    await waitFor(() => screen.getByText("files"));
    fireEvent.click(screen.getByText("files"));
    await waitFor(() => screen.getByText("Disable"));
    fireEvent.click(screen.getByText("Disable"));
    expect(posted).toContainEqual({
      type: "toggleMcpServer",
      name: "files",
      scope: "project",
      disabled: true,
      pluginName: undefined,
    });
  });

  it("shows the error state when the host reports an error and no servers loaded", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "error", message: "disk on fire" });
    await waitFor(() => expect(screen.getByText("Failed to load MCP servers")).toBeTruthy());
  });

  it("opens the community directory from the empty state", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [] });
    await waitFor(() => screen.getByText("Browse MCP servers →"));
    fireEvent.click(screen.getByText("Browse MCP servers →"));
    expect(posted).toContainEqual({ type: "openUrl", url: "https://mcp.so" });
  });
});
