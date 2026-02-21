import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../ErrorBoundary";

function ThrowingComponent() {
  throw new Error("Test render error");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div>Healthy Child</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy Child")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Test render error/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload Page/i })).toBeInTheDocument();
  });

  it("logs caught errors to console.error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      "Uncaught error:",
      expect.any(Error),
      expect.any(Object),
    );
  });
});
