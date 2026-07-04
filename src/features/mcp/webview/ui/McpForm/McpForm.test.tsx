// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { h } from "preact";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { McpServer } from "../../../types";
import { McpForm } from "./McpForm";

function srv(p: Partial<McpServer> & Pick<McpServer, "name" | "scope">): McpServer {
  return { type: "stdio", command: "node", ...p };
}

describe("McpForm", () => {
  it("shows the scope picker in add mode, omits it in edit mode", () => {
    const { rerender } = render(h(McpForm, { server: null, onClose: () => {}, onSubmit: () => {} }));
    expect(screen.getByLabelText("Server scope")).toBeTruthy();
    expect(screen.getByText("Add MCP server")).toBeTruthy();

    rerender(h(McpForm, { server: srv({ name: "x", scope: "project" }), onClose: () => {}, onSubmit: () => {} }));
    expect(screen.queryByLabelText("Server scope")).toBeNull();
    expect(screen.getByText("Edit MCP server")).toBeTruthy();
  });

  it("disables save until name + connection are filled", () => {
    render(h(McpForm, { server: null, onClose: () => {}, onSubmit: vi.fn() }));
    const save = screen.getByText("Add").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "srv" } });
    expect(save.disabled).toBe(true); // command still empty
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "node" } });
    expect(save.disabled).toBe(false);
  });

  it("builds a stdio McpServerInput with split args and parsed env", () => {
    const onSubmit = vi.fn();
    render(h(McpForm, { server: null, onClose: () => {}, onSubmit }));
    fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "local" } });
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.input(screen.getByLabelText("Args"), { target: { value: "-y  server" } });
    fireEvent.input(screen.getByLabelText("Environment variables"), {
      target: { value: "KEY=v\n\nX=1" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onSubmit).toHaveBeenCalledWith(null, {
      name: "local",
      scope: "project",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      url: undefined,
      env: { KEY: "v", X: "1" },
      headers: {},
    });
  });

  it("switches to a URL field for http transport and emits originalName on edit", () => {
    const onSubmit = vi.fn();
    render(
      h(McpForm, {
        server: srv({ name: "api", scope: "global", type: "http", url: "https://old" }),
        onClose: () => {},
        onSubmit,
      }),
    );
    expect((screen.getByLabelText("URL") as HTMLInputElement).value).toBe("https://old");
    fireEvent.input(screen.getByLabelText("URL"), { target: { value: "https://new" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledWith(
      "api",
      expect.objectContaining({ name: "api", scope: "global", transport: "http", url: "https://new" }),
    );
  });

  it("hides the Headers field for stdio and shows it for url transports", () => {
    // stdio: Command + Args, no Headers (headers don't apply to a local process).
    render(h(McpForm, { server: srv({ name: "s", scope: "project" }), onClose: () => {}, onSubmit: () => {} }));
    expect(screen.getByLabelText("Command")).toBeTruthy();
    expect(screen.queryByLabelText("Headers")).toBeNull();

    // http: URL + Headers, no Command.
    render(
      h(McpForm, {
        server: srv({ name: "h", scope: "global", type: "http", url: "https://x" }),
        onClose: () => {},
        onSubmit: () => {},
      }),
    );
    expect(screen.getByLabelText("Headers")).toBeTruthy();
  });

  it("flags an invalid server name and blocks save", () => {
    render(h(McpForm, { server: null, onClose: () => {}, onSubmit: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "bad name!" } });
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "node" } });
    expect(screen.getByText(/Letters, digits/)).toBeTruthy();
    expect((screen.getByText("Add").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("flags a duplicate name in the same scope and blocks save", () => {
    render(
      h(McpForm, {
        server: null,
        existing: [{ name: "github", scope: "project" }],
        onClose: () => {},
        onSubmit: vi.fn(),
      }),
    );
    fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "github" } });
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "node" } });
    expect(screen.getByText(/already exists in project scope/)).toBeTruthy();
    expect((screen.getByText("Add").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows editing a server without a self-duplicate error", () => {
    render(
      h(McpForm, {
        server: srv({ name: "github", scope: "project" }),
        existing: [{ name: "github", scope: "project" }],
        onClose: () => {},
        onSubmit: vi.fn(),
      }),
    );
    expect(screen.queryByText(/already exists/)).toBeNull();
    expect((screen.getByText("Save").closest("button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("requires a valid URL scheme for url transports", () => {
    render(
      h(McpForm, {
        server: srv({ name: "api", scope: "global", type: "http", url: "" }),
        onClose: () => {},
        onSubmit: vi.fn(),
      }),
    );
    fireEvent.input(screen.getByLabelText("URL"), { target: { value: "example.com" } });
    expect(screen.getByText(/Must start with http/)).toBeTruthy();
    const save = screen.getByText("Save").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.input(screen.getByLabelText("URL"), { target: { value: "https://example.com/mcp" } });
    expect(save.disabled).toBe(false);
  });

  it("blocks save on a malformed env line and names the line", () => {
    render(h(McpForm, { server: null, onClose: () => {}, onSubmit: vi.fn() }));
    fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "srv" } });
    fireEvent.input(screen.getByLabelText("Command"), { target: { value: "node" } });
    fireEvent.input(screen.getByLabelText("Environment variables"), {
      target: { value: "OK=1\nNOPE" },
    });
    expect(screen.getByText(/Line 2 must be KEY=value/)).toBeTruthy();
    expect((screen.getByText("Add").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("fires onClose from Cancel", () => {
    const onClose = vi.fn();
    render(h(McpForm, { server: null, onClose, onSubmit: () => {} }));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
