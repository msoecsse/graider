import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { AssignmentDetailDiagnostic } from "./assignmentDetailTypes";

describe("DiagnosticsPanel", () => {
  it("shows a plain note when there are no diagnostics", () => {
    render(<DiagnosticsPanel diagnostics={[]} />);

    expect(screen.getByRole("heading", { level: 2, name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("No diagnostics.")).toBeInTheDocument();
  });

  it("groups diagnostics and renders severity, message, and code", () => {
    const diagnostics: readonly AssignmentDetailDiagnostic[] = [
      {
        code: "assignment_detail_template_repository_missing",
        severity: "error",
        message: "Template repository missing.",
        context: { repository: "owner/missing-template" }
      },
      {
        code: "github_token_required",
        severity: "warning",
        message: "GitHub token required.",
        context: {}
      }
    ];

    render(<DiagnosticsPanel diagnostics={diagnostics} />);

    expect(screen.getByText("Template repository missing.")).toBeInTheDocument();
    expect(screen.getByText("GitHub token required.")).toBeInTheDocument();
    expect(screen.getByText("assignment_detail_template_repository_missing")).toBeInTheDocument();
    expect(screen.getByText("owner/missing-template")).toBeInTheDocument();
  });
});
