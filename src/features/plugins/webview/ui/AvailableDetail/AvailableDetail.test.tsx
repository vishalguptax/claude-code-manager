// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { availablePlugin } from "../../__tests__/fixtures";
import { AvailableDetail, type AvailableDetailProps } from "./AvailableDetail";

function props(overrides: Partial<AvailableDetailProps> = {}): AvailableDetailProps {
  return {
    plugin: availablePlugin(),
    onBack: vi.fn(),
    onInstall: vi.fn(),
    onShowInstalled: vi.fn(),
    onOpenUrl: vi.fn(),
    onCopyId: vi.fn(),
    ...overrides,
  };
}

describe("AvailableDetail", () => {
  it("shows what the plugin is and where it comes from", () => {
    render(<AvailableDetail {...props()} />);
    expect(screen.getByText("swift-lsp")).toBeTruthy();
    expect(screen.getByText("Swift language server for code intelligence.")).toBeTruthy();
    expect(screen.getByText("Anthropic")).toBeTruthy();
    expect(screen.getByText("swift-lsp@claude-plugins-official")).toBeTruthy();
  });

  it("installs at user scope unless another is picked, and says where to finish", () => {
    const p = props();
    render(<AvailableDetail {...p} />);
    expect(screen.getByText("You, in every project.")).toBeTruthy();
    fireEvent.click(screen.getByText("Install"));
    expect(p.onInstall).toHaveBeenCalledWith("swift-lsp@claude-plugins-official", "user");
    expect(screen.getByText(/Finish in the terminal/)).toBeTruthy();
  });

  it("installs at the scope picked, explaining who it reaches", () => {
    const p = props();
    render(<AvailableDetail {...p} />);
    fireEvent.click(screen.getByText("Project"));
    expect(screen.getByText(/Everyone on this project/)).toBeTruthy();
    fireEvent.click(screen.getByText("Install"));
    expect(p.onInstall).toHaveBeenCalledWith("swift-lsp@claude-plugins-official", "project");
  });

  it("turns into a link to the installed plugin once it is installed", () => {
    const p = props({ plugin: availablePlugin({ installed: true }) });
    render(<AvailableDetail {...p} />);
    expect(screen.queryByText("Install")).toBeNull();
    expect(screen.queryByLabelText("Install scope")).toBeNull();
    fireEvent.click(screen.getByText("Show installed"));
    expect(p.onShowInstalled).toHaveBeenCalledWith("swift-lsp@claude-plugins-official");
  });

  it("opens the homepage and copies the id", () => {
    const p = props();
    render(<AvailableDetail {...p} />);
    fireEvent.click(screen.getByText("Homepage"));
    fireEvent.click(screen.getByText("Copy id"));
    expect(p.onOpenUrl).toHaveBeenCalledWith("https://github.com/anthropics/claude-plugins-official");
    expect(p.onCopyId).toHaveBeenCalledWith("swift-lsp@claude-plugins-official");
  });

  it("offers no homepage the catalog did not give", () => {
    render(<AvailableDetail {...props({ plugin: availablePlugin({ homepage: "" }) })} />);
    expect(screen.queryByText("Homepage")).toBeNull();
  });
});
