// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installViewportGuard } from "./viewportGuard";

let teardown: (() => void) | undefined;

afterEach(() => {
  teardown?.();
  teardown = undefined;
  vi.restoreAllMocks();
});

describe("installViewportGuard", () => {
  it("snaps the viewport back when something scrolls the document", () => {
    const scrollTo = vi.fn();
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(1484);
    teardown = installViewportGuard();

    document.dispatchEvent(new Event("scroll"));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("leaves a viewport that is already at the origin alone", () => {
    const scrollTo = vi.fn();
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
    teardown = installViewportGuard();

    document.dispatchEvent(new Event("scroll"));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("stops guarding once torn down", () => {
    const scrollTo = vi.fn();
    vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(100);
    installViewportGuard()();

    document.dispatchEvent(new Event("scroll"));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
