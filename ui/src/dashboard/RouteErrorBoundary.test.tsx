import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

const Boom = (): ReactElement => {
  throw new Error("boom");
};

const Safe = (): ReactElement => <p>Safe screen</p>;

const renderBrokenRoute = (): void => {
  render(
    <MemoryRouter initialEntries={["/broken"]}>
      <RouteErrorBoundary>
        <Routes>
          <Route path="/broken" element={<Boom />} />
          <Route path="/" element={<Safe />} />
        </Routes>
      </RouteErrorBoundary>
    </MemoryRouter>
  );
};

describe("RouteErrorBoundary", () => {
  it("renders the section 2.5 message instead of a blank screen when a routed screen throws, and still logs the error", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBrokenRoute();

    expect(
      screen.getByRole("heading", { name: "Something went wrong displaying this page." })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error occurred while rendering this screen/u)
    ).toBeInTheDocument();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Unhandled error rendering a routed screen.",
      expect.any(Error),
      expect.anything()
    );

    consoleErrorSpy.mockRestore();
  });

  it("recovers when navigating away from the broken screen, instead of leaving the app stuck", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    renderBrokenRoute();
    fireEvent.click(screen.getByRole("button", { name: "Return to dashboard" }));

    expect(screen.getByText("Safe screen")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Something went wrong displaying this page." })
    ).toBeNull();
  });
});
