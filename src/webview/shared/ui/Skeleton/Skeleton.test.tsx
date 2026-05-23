// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import { Skeleton, SkeletonList } from "../Skeleton";

describe("Skeleton", () => {
  it("renders a title bar and a sub bar by default", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector(".skeleton-row")).toBeTruthy();
    expect(container.querySelector(".skeleton-bar-title")).toBeTruthy();
    expect(container.querySelector(".skeleton-bar-sub")).toBeTruthy();
  });

  it("omits the sub bar when sub=false", () => {
    const { container } = render(<Skeleton sub={false} />);
    expect(container.querySelector(".skeleton-bar-title")).toBeTruthy();
    expect(container.querySelector(".skeleton-bar-sub")).toBeNull();
  });
});

describe("SkeletonList", () => {
  it("renders the requested number of rows inside the panel-loader chrome", () => {
    const { container } = render(<SkeletonList rows={4} />);
    expect(container.querySelector(".panel-loader")).toBeTruthy();
    expect(container.querySelector(".skeleton-list")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-row").length).toBe(4);
  });

  it("defaults to six rows and is marked busy for assistive tech", () => {
    const { container } = render(<SkeletonList />);
    expect(container.querySelectorAll(".skeleton-row").length).toBe(6);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
