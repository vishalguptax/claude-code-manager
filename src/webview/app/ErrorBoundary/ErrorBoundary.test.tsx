// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/preact";
import type { VNode } from "preact";
import { ErrorBoundary } from "../ErrorBoundary";

function Boom(): VNode {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>safe</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("safe")).toBeTruthy();
  });

  it("renders a fallback when a child throws", () => {
    // Suppress noisy console.error in this test.
    const orig = console.error;
    console.error = () => undefined;
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    } finally {
      console.error = orig;
    }
  });
});
