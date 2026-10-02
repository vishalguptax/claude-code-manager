// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { setVscodeApi } from "../../../../webview/shared/hooks";
import {
  DEFAULT_MCP_MARKETPLACE_URL,
  _resetMessageBus,
  dispatch,
  marketplaceMcpUrl,
} from "../../../../webview/shared/model";
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
  marketplaceMcpUrl.value = DEFAULT_MCP_MARKETPLACE_URL;
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

  it("opens the owning config file with the server name from the detail view", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [srv({ name: "files", scope: "global" })] });
    await waitFor(() => screen.getByText("files"));
    fireEvent.click(screen.getByText("files"));
    // Open Config lives in the "More" overflow menu.
    await waitFor(() => screen.getByText("More"));
    fireEvent.click(screen.getByText("More"));
    fireEvent.click(screen.getByText("Open Config"));
    expect(posted).toContainEqual({ type: "openMcpConfig", scope: "global", name: "files" });
  });

  it("surfaces host parse errors as a banner while still rendering servers", async () => {
    render(h(McpTab, {}));
    dispatch({
      type: "mcpServers",
      data: { servers: [srv({ name: "files", scope: "project" })], authNeeds: [] },
      errors: ["Failed to parse .mcp.json: bad"],
    });
    await waitFor(() => expect(screen.getByText("files")).toBeTruthy());
    expect(screen.getByText("Failed to parse .mcp.json: bad")).toBeTruthy();
  });

  it("shows the error state when the host reports an error and no servers loaded", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "error", message: "disk on fire" });
    await waitFor(() => expect(screen.getByText("Failed to load MCP servers")).toBeTruthy());
  });

  it("opens the catalog from the empty state", async () => {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: [] });
    await waitFor(() => screen.getByText("Add from catalog"));
    fireEvent.click(screen.getByText("Add from catalog"));
    await waitFor(() => expect(screen.getByLabelText("Search MCP catalog")).toBeTruthy());
  });
});

describe("McpTab — catalog", () => {
  async function openCatalog(servers: McpServer[] = []): Promise<void> {
    render(h(McpTab, {}));
    dispatch({ type: "mcpServers", data: servers });
    // The list's side action — present whether or not servers exist.
    await waitFor(() => screen.getByLabelText("Add MCP server from catalog"));
    fireEvent.click(screen.getByLabelText("Add MCP server from catalog"));
    await waitFor(() => screen.getByLabelText("Search MCP catalog"));
  }

  it("adds a catalog server through the pre-filled form, at the chosen scope", async () => {
    await openCatalog();
    fireEvent.click(screen.getByText("Playwright"));
    await waitFor(() => screen.getByText("Add MCP server"));
    fireEvent.click(screen.getByText("Add"));
    expect(posted).toContainEqual({
      type: "addMcpServer",
      server: {
        name: "playwright",
        scope: "local",
        transport: "stdio",
        command: "npx",
        args: ["@playwright/mcp@latest"],
        url: undefined,
        env: {},
        headers: {},
      },
    });
  });

  it("returns to the catalog when the pre-filled form is cancelled", async () => {
    await openCatalog();
    fireEvent.click(screen.getByText("Sentry"));
    await waitFor(() => screen.getByText("Add MCP server"));
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.getByLabelText("Search MCP catalog")).toBeTruthy());
  });

  it("opens the existing entry for a server that is already configured", async () => {
    await openCatalog([srv({ name: "playwright", scope: "global" })]);
    fireEvent.click(screen.getByText("Playwright"));
    // The detail view of the configured server, not a second Add form.
    await waitFor(() => expect(screen.getByText("Connection")).toBeTruthy());
    expect(screen.queryByText("Add MCP server")).toBeNull();
  });

  it("opens the configured directory URL for servers beyond the catalog", async () => {
    marketplaceMcpUrl.value = "https://registry.example";
    await openCatalog();
    fireEvent.click(screen.getByText("Find more servers"));
    expect(posted).toContainEqual({ type: "openUrl", url: "https://registry.example" });
  });
});
