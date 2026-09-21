import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TechnicalDetails } from "./TechnicalDetails";

const mockClipboard = (writeText: ReturnType<typeof vi.fn>): void => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
};

describe("TechnicalDetails", () => {
  it("renders as a single collapsed disclosure listing each item", () => {
    render(
      <TechnicalDetails
        items={[
          { id: "slug", label: "Slug", value: "lab02" },
          { id: "path", label: "Assignment file", value: "terms/27s1/lab02/assignment.yml" }
        ]}
      />
    );

    const details = screen.getByText("Technical details").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Slug")).toBeInTheDocument();
    expect(screen.getByText("lab02")).toBeInTheDocument();
  });

  it("only renders a copy button for copyable items", () => {
    render(
      <TechnicalDetails
        items={[
          { id: "slug", label: "Slug", value: "lab02", copyable: true },
          { id: "path", label: "Assignment file", value: "terms/27s1/lab02/assignment.yml" }
        ]}
      />
    );

    expect(screen.getAllByRole("button", { name: /Copy /i })).toHaveLength(1);
  });

  it("shows Copied feedback after a successful copy", async () => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
    render(
      <TechnicalDetails items={[{ id: "slug", label: "Slug", value: "lab02", copyable: true }]} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Slug" }));

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("shows failure feedback when the clipboard write rejects", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("clipboard unavailable")));
    render(
      <TechnicalDetails items={[{ id: "slug", label: "Slug", value: "lab02", copyable: true }]} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Slug" }));

    await waitFor(() => {
      expect(screen.getByText("Unable to copy")).toBeInTheDocument();
    });
  });
});
