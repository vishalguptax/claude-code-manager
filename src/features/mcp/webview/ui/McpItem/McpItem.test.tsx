// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { McpServer } from "../../../types";
import { McpItem } from "./McpItem";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

describe("McpItem", () => {
  it("renders name, type badge, and connection preview", () => {
    render(
      h(McpItem, {
        server: srv({ name: "files", scope: "project", args: ["serve"] }),
        active: false,
        onSelect: vi.fn(),
        onCopyName: vi.fn(),
      }),
    );
    expect(screen.getByText("files")).toBeTruthy();
    expect(screen.getByText("stdio")).toBeTruthy();
    expect(screen.getByText("node serve")).toBeTruthy();
  });

  it("invokes onSelect when the row is clicked", () => {
    const onSelect = vi.fn();
    render(
      h(McpItem, {
        server: srv({ name: "files", scope: "project" }),
        active: false,
        onSelect,
        onCopyName: vi.fn(),
      }),
    );
    fireEvent.click(screen.getByText("files"));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("copies the name without selecting the row", () => {
    const onSelect = vi.fn();
    const onCopyName = vi.fn();
    render(
      h(McpItem, {
        server: srv({ name: "files", scope: "project" }),
        active: false,
        onSelect,
        onCopyName,
      }),
    );
    fireEvent.click(screen.getByTitle("Copy name"));
    expect(onCopyName).toHaveBeenCalledWith("files");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows disabled + read-only markers for a disabled plugin server", () => {
    render(
      h(McpItem, {
        server: srv({ name: "p", scope: "plugin", pluginName: "p@m", disabled: true }),
        active: true,
        onSelect: vi.fn(),
        onCopyName: vi.fn(),
      }),
    );
    expect(screen.getByText("disabled")).toBeTruthy();
    expect(screen.getByText("read-only")).toBeTruthy();
  });
});
