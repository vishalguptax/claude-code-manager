// @vitest-environment happy-dom
import { render, screen } from "@testing-library/preact";
import { h } from "preact";
import { describe, expect, it } from "vitest";
import { MetaRow } from "./MetaRow";

describe("MetaRow", () => {
  it("renders a key/value pair", () => {
    render(h(MetaRow, { k: "Active days", v: "3 / 30" }));
    expect(screen.getByText("Active days")).toBeTruthy();
    expect(screen.getByText("3 / 30")).toBeTruthy();
  });

  it("applies the total modifier", () => {
    render(h(MetaRow, { k: "Total", v: "$5", total: true }));
    const row = screen.getByText("Total").closest(".acct-meta-row") as HTMLElement;
    expect(row.classList.contains("acct-meta-row-total")).toBe(true);
  });
});
