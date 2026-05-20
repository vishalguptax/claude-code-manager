// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Loading } from "../Loading";

describe("Loading", () => {
  it("renders the loading indicator", () => {
    render(<Loading />);
    expect(screen.getByText(/Loading/i)).toBeTruthy();
  });
});
