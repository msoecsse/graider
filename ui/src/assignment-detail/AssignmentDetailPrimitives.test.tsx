import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CopyButton,
  DetailItem,
  DiagnosticEntry,
  StatusItem,
  getCopyStateText,
  getRepositoryShortName
} from "./AssignmentDetailPrimitives";

describe("DetailItem", () => {
  it("renders a label/value pair, falling back to a placeholder for null", () => {
    render(<DetailItem label="Points" value={100} />);
    expect(screen.getByText("Points")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });
});

describe("StatusItem", () => {
  it("marks an attention-needing status distinctly from a healthy one", () => {
    const { rerender } = render(<StatusItem label="Workflow status" value="available" />);
    expect(screen.getByText("Available")).not.toHaveClass("status-chip--attention");

    rerender(<StatusItem label="Workflow status" value="missing" />);
    expect(screen.getByText("Missing")).toHaveClass("status-chip--attention");
  });
});

describe("CopyButton", () => {
  it("renders nothing when there is no value to copy", () => {
    const { container } = render(
      <CopyButton
        label="Copy X"
        value={null}
        copyKey="template-repository"
        copyState={null}
        onCopy={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onCopy with the key and value", () => {
    const onCopy = vi.fn();
    render(
      <CopyButton
        label="Copy template repository"
        value="graider-sandbox/csc1120L2Template"
        copyKey="template-repository"
        copyState={null}
        onCopy={onCopy}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy template repository" }));
    expect(onCopy).toHaveBeenCalledWith("template-repository", "graider-sandbox/csc1120L2Template");
  });
});

describe("getCopyStateText", () => {
  it("returns null when the state is for a different key", () => {
    expect(
      getCopyStateText({ key: "workflow-path", status: "copied" }, "template-repository")
    ).toBeNull();
  });

  it("returns Copied or Unable to copy for the matching key", () => {
    expect(
      getCopyStateText({ key: "template-repository", status: "copied" }, "template-repository")
    ).toBe("Copied");
    expect(
      getCopyStateText({ key: "template-repository", status: "failed" }, "template-repository")
    ).toBe("Unable to copy.");
  });
});

describe("getRepositoryShortName", () => {
  it("returns the last path segment, or a placeholder when null", () => {
    expect(getRepositoryShortName("graider-sandbox/csc1120L2Template")).toBe("csc1120L2Template");
    expect(getRepositoryShortName(null)).toBe("Not configured");
  });
});

describe("DiagnosticEntry", () => {
  it("renders severity, category, message, code, and context", () => {
    render(
      <ul>
        <DiagnosticEntry
          diagnostic={{
            code: "assignment_detail_template_repository_missing",
            severity: "error",
            message: "Template repository missing.",
            context: { repository: "owner/missing-template" }
          }}
        />
      </ul>
    );

    expect(screen.getByText("Template repository missing.")).toBeInTheDocument();
    expect(screen.getByText("assignment_detail_template_repository_missing")).toBeInTheDocument();
    expect(screen.getByText("repository")).toBeInTheDocument();
    expect(screen.getByText("owner/missing-template")).toBeInTheDocument();
  });
});
