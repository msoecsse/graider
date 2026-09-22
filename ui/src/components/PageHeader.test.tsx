import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the breadcrumb eyebrow, title, and meta", () => {
    render(
      <PageHeader eyebrow="CSC1120 · Spring 2027" title="Lab 02" meta="100 pts · due Mon Jun 15" />
    );

    expect(screen.getByText("CSC1120 · Spring 2027")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Lab 02" })).toBeInTheDocument();
    expect(screen.getByText("100 pts · due Mon Jun 15")).toBeInTheDocument();
  });

  it("renders the primary action with its keyboard hint and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <PageHeader
        title="Lab 02"
        primaryAction={{ label: "Publish 4 reports", onClick, kbd: "P" }}
      />
    );

    const button = screen.getByRole("button", { name: "Publish 4 reports P" });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("P")).toHaveClass("kbd-hint");
  });

  it("caps secondary actions at two even when more are supplied", () => {
    render(
      <PageHeader
        title="Lab 02"
        secondaryActions={[
          { label: "First", onClick: vi.fn() },
          { label: "Second", onClick: vi.fn() },
          { label: "Third", onClick: vi.fn() }
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Third" })).not.toBeInTheDocument();
  });

  it("renders a supplied overflow slot", () => {
    render(<PageHeader title="Lab 02" overflow={<button type="button">⋯</button>} />);

    expect(screen.getByRole("button", { name: "⋯" })).toBeInTheDocument();
  });

  it("sets the heading id from titleId so an external landmark can resolve it", () => {
    render(
      <main aria-labelledby="page-title">
        <PageHeader title="Lab 02" titleId="page-title" />
      </main>
    );

    const main = screen.getByRole("main", { name: "Lab 02" });
    const heading = screen.getByRole("heading", { name: "Lab 02" });
    expect(heading).toHaveAttribute("id", "page-title");
    expect(main).toHaveAttribute("aria-labelledby", "page-title");
  });

  it("omits the heading id when titleId is not supplied", () => {
    render(<PageHeader title="Lab 02" />);

    expect(screen.getByRole("heading", { name: "Lab 02" })).not.toHaveAttribute("id");
  });
});
