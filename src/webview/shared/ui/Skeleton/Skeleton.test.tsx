// @vitest-environment happy-dom
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  Skeleton,
  SkeletonBlock,
  SkeletonCircle,
  SkeletonLine,
  SkeletonList,
  SkeletonRect,
} from "../Skeleton";

describe("SkeletonLine", () => {
  it("renders a line element defaulting to full width", () => {
    const { container } = render(<SkeletonLine />);
    const el = container.querySelector<HTMLElement>(".skeleton-el.skeleton-line");
    expect(el).toBeTruthy();
    expect(el?.style.width).toBe("100%");
    expect(el?.style.height).toBe("10px");
  });

  it("applies a numeric width as px and a string width verbatim", () => {
    const { container: a } = render(<SkeletonLine width={120} height={6} />);
    const elA = a.querySelector<HTMLElement>(".skeleton-line");
    expect(elA?.style.width).toBe("120px");
    expect(elA?.style.height).toBe("6px");

    const { container: b } = render(<SkeletonLine width="60%" />);
    expect(b.querySelector<HTMLElement>(".skeleton-line")?.style.width).toBe("60%");
  });
});

describe("SkeletonBlock / SkeletonRect", () => {
  it("renders a block defaulting to the control height", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.querySelector<HTMLElement>(".skeleton-el.skeleton-block");
    expect(el).toBeTruthy();
    expect(el?.style.height).toBe("32px");
  });

  it("applies an explicit radius and height", () => {
    const { container } = render(<SkeletonBlock width={40} height={20} radius={3} />);
    const el = container.querySelector<HTMLElement>(".skeleton-block");
    expect(el?.style.width).toBe("40px");
    expect(el?.style.height).toBe("20px");
    expect(el?.style.borderRadius).toBe("3px");
  });

  it("exposes SkeletonRect as an alias of SkeletonBlock", () => {
    expect(SkeletonRect).toBe(SkeletonBlock);
    const { container } = render(<SkeletonRect width={10} />);
    expect(container.querySelector(".skeleton-block")).toBeTruthy();
  });
});

describe("SkeletonCircle", () => {
  it("renders a circle sized by the size prop", () => {
    const { container } = render(<SkeletonCircle size={28} />);
    const el = container.querySelector<HTMLElement>(".skeleton-el.skeleton-circle");
    expect(el).toBeTruthy();
    expect(el?.style.width).toBe("28px");
    expect(el?.style.height).toBe("28px");
  });

  it("defaults to the 40px avatar size", () => {
    const { container } = render(<SkeletonCircle />);
    const el = container.querySelector<HTMLElement>(".skeleton-circle");
    expect(el?.style.width).toBe("40px");
  });
});

describe("Skeleton", () => {
  it("renders a title line and a sub line by default", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector(".skeleton-row")).toBeTruthy();
    expect(container.querySelectorAll(".skeleton-line").length).toBe(2);
  });

  it("omits the sub line when sub=false", () => {
    const { container } = render(<Skeleton sub={false} />);
    expect(container.querySelectorAll(".skeleton-line").length).toBe(1);
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
