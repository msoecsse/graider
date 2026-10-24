import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview, FindingPlan, ImportResult } from "../../electron/reviewImportService";
import { ReviewImportWorkflow } from "./ReviewImportWorkflow";
const SHA_LENGTH = 40;
const SHA = "a".repeat(SHA_LENGTH);
const request = {
  courseFolderId: "course",
  courseFolderPath: "/course",
  termCode: "27s1",
  assignmentSlug: "lab04"
};
const finding = (
  status: FindingPlan["status"],
  id: string,
  extra: Partial<FindingPlan> = {}
): FindingPlan => ({
  finding: {
    id,
    title: id,
    text: "**Markdown body** [link](javascript:alert(1))",
    deduction: 2,
    tags: ["design"]
  },
  provenance: { source: "review_import", schemaVersion: 1, reviewId: "review", findingId: id },
  key: id,
  status,
  duplicate: status === "duplicate",
  rubric: { status: "general", diagnostics: [] },
  anchor: { status: "general", diagnostics: [] },
  diagnostics: [],
  eligibleToApply: status === "ready" || status === "warning",
  requiresApproval: status === "warning",
  recoveryRequired: status === "warning",
  operation: status === "ready" || status === "warning" ? "add_comment" : null,
  ...extra
});
const preview = (): ImportPreview => ({
  planId: "plan",
  version: 1,
  students: [
    {
      studentId: "ada",
      githubUsername: "ada-gh",
      firstName: "Ada",
      lastName: "Lovelace",
      section: "001"
    }
  ],
  plan: {
    schemaVersion: 1,
    diagnostics: [],
    summary: {
      ready: 1,
      warning: 1,
      duplicate: 1,
      unmatched: 1,
      invalid: 1,
      totalFiles: 5,
      eligibleFindings: 3,
      findingCounts: { ready: 2, warning: 1, duplicate: 1, unmatched: 0, invalid: 1 }
    },
    reviews: ["ready", "warning", "duplicate", "unmatched", "invalid"].map((status, index) => ({
      filename: `${status}.json`,
      status: status as FindingPlan["status"],
      review: {
        schemaVersion: 1,
        reviewId: status,
        assignment: { courseCode: "SE2030", termCode: "27s1", assignmentSlug: "lab04" },
        student: { studentId: "ada" },
        repository: { owner: "org", name: "repo", reviewedCommitSha: "b".repeat(SHA_LENGTH) },
        findings: []
      },
      matchedStudent: { studentId: "ada", githubUsername: "ada-gh" },
      currentCommitSha: SHA,
      shaState: index === 1 ? "changed" : "exact",
      diagnostics: [],
      findingCounts: { ready: 0, warning: 0, duplicate: 0, unmatched: 0, invalid: 0 },
      findings:
        index === 0
          ? [finding("ready", "Ready one"), finding("ready", "Ready two")]
          : index === 1
            ? [
                finding("warning", "Recover", {
                  anchor: {
                    status: "recoverable",
                    original: {
                      file: "src/Main.java",
                      startLine: 2,
                      endLine: 2,
                      excerpt: "input.trim();"
                    },
                    proposed: { file: "src/Main.java", startLine: 3, endLine: 3 },
                    diagnostics: []
                  },
                  rubric: { status: "fallback", categoryId: "design", diagnostics: [] }
                }),
                finding("warning", "Unsafe", {
                  eligibleToApply: false,
                  anchor: { status: "unresolved", diagnostics: [] },
                  operation: null,
                  diagnostics: [{ code: "ambiguous", message: "Source is ambiguous" }]
                })
              ]
            : status === "unmatched"
              ? []
              : [finding(status as FindingPlan["status"], status)]
    }))
  }
});
const result: ImportResult = {
  applied: 1,
  duplicatesSkipped: 1,
  failed: 1,
  studentsAffected: 1,
  outcomes: [
    { studentId: "ada", findingKey: "Ready one", status: "applied", message: "Applied" },
    { studentId: "ada", findingKey: "Ready two", status: "failed", message: "Changed SHA" }
  ]
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  Object.assign(window.graiderUI, { chooseReviewImport: vi.fn().mockResolvedValue(preview()) });
  Object.assign(window.graiderUI, { applyReviewImport: vi.fn().mockResolvedValue(result) });
  Object.assign(window.graiderUI, { closeReviewImport: vi.fn().mockResolvedValue(undefined) });
});
const open = async (onApplied = vi.fn().mockResolvedValue(undefined)) => {
  render(<ReviewImportWorkflow request={request} onApplied={onApplied} />);
  fireEvent.click(screen.getByRole("button", { name: "Import Reviews..." }));
  await screen.findByText("Review Import Preview");
  return onApplied;
};
describe("Review Import Preview", () => {
  it("requests native selection with assignment identity and cancels without opening or applying", async () => {
    Object.assign(window.graiderUI, { chooseReviewImport: vi.fn().mockResolvedValue(null) });
    render(<ReviewImportWorkflow request={request} onApplied={vi.fn()} />);
    fireEvent.click(screen.getByText("Import Reviews..."));
    expect(window.graiderUI.chooseReviewImport).toHaveBeenCalledWith(request);
    expect(screen.queryByText("Review Import Preview")).not.toBeInTheDocument();
    expect(window.graiderUI.applyReviewImport).not.toHaveBeenCalled();
  });
  it("renders typed summary and compact expandable rows, trusted identity, repository and both SHAs", async () => {
    await open();
    [
      "Ready: 1",
      "Warnings / Approval Required: 1",
      "Duplicates: 1",
      "Unmatched: 1",
      "Invalid: 1"
    ].forEach((text) => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.getAllByText("Ada Lovelace")).toHaveLength(5);
    expect(screen.getAllByText(/GitHub: ada-gh · MSOE\/package: ada · Section: 001/)).toHaveLength(
      5
    );
    expect(screen.getAllByText(SHA)).toHaveLength(5);
    expect(document.querySelectorAll("details[open]")).toHaveLength(0);
    fireEvent.click(screen.getAllByText(/Findings \(/)[0]!);
    expect(document.querySelectorAll("details")).toHaveLength(5);
    expect(document.querySelector("details")).toHaveAttribute("open");
  });
  it("defaults only Ready findings and supports individual, student and bulk selection", async () => {
    await open();
    expect(screen.getByLabelText("Select finding Ready one")).toBeChecked();
    expect(screen.getByLabelText("Select finding Recover")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Select finding Ready one"));
    expect(screen.getByLabelText("Select review ready.json")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Select review ready.json"));
    expect(screen.getByLabelText("Select finding Ready one")).toBeChecked();
    fireEvent.click(screen.getByText("Clear selections"));
    expect(screen.getByText("Apply Reviews")).toBeDisabled();
    fireEvent.click(screen.getByText("Select all Ready"));
    expect(screen.getByLabelText("Select finding Ready two")).toBeChecked();
    expect(screen.getByLabelText("Select finding duplicate")).toBeDisabled();
    expect(screen.getByLabelText("Select finding invalid")).toBeDisabled();
    expect(screen.getByLabelText("Select review unmatched.json")).toBeDisabled();
  });
  it("renders safe Markdown, general findings, deductions, rubric and relocated source context", async () => {
    await open();
    expect(screen.getAllByText("Markdown body")[0]!.tagName).toBe("STRONG");
    expect(document.querySelector("dialog a")).toBeNull();
    expect(screen.getAllByText(/General comment \(no source location\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/src\/Main.java:3–3/)).toBeInTheDocument();
    expect(screen.getByText("input.trim();")).toBeInTheDocument();
    expect(screen.getByText(/Rubric: design \(fallback\)/)).toBeInTheDocument();
  });
  it("requires explicit recovery approval and cannot override unresolved findings", async () => {
    await open();
    expect(screen.getByLabelText("Select finding Recover")).toBeDisabled();
    expect(screen.getByLabelText("Select finding Unsafe")).toBeDisabled();
    expect(screen.queryByLabelText("Approve Unsafe")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Approve Recover"));
    expect(screen.getByLabelText("Select finding Recover")).toBeEnabled();
    expect(screen.getByLabelText("Select finding Recover")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Approve Recover"));
    expect(screen.getByLabelText("Select finding Recover")).toBeDisabled();
    expect(screen.getByLabelText("Select finding Recover")).not.toBeChecked();
  });
  it("sends only selections/approvals with plan identity and refreshes ordinary grading, then shows partial results", async () => {
    const onApplied = await open();
    fireEvent.click(screen.getByText("Clear selections"));
    fireEvent.click(screen.getByLabelText("Approve Recover"));
    fireEvent.click(screen.getByText("Apply Reviews"));
    await screen.findByText("Review import results");
    expect(window.graiderUI.applyReviewImport).toHaveBeenCalledWith({
      ...request,
      planId: "plan",
      version: 1,
      selections: [{ reviewIndex: 1, studentId: "ada", findingKey: "Recover", approved: true }]
    });
    expect(onApplied).toHaveBeenCalledWith(result);
    expect(
      screen.getByText(/1 applied · 1 duplicates skipped · 1 failed · 1 students affected/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Apply Reviews")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Review Import Preview")).not.toBeInTheDocument();
  });
  it("Cancel discards the preview without applying", async () => {
    await open();
    fireEvent.click(screen.getByText("Cancel"));
    expect(window.graiderUI.applyReviewImport).not.toHaveBeenCalled();
    expect(window.graiderUI.closeReviewImport).toHaveBeenCalled();
  });
  it("uses bounded scrolling and collapsed findings for a 50-student batch", async () => {
    const value = preview();
    const batch = {
      ...value,
      plan: {
        ...value.plan,
        reviews: Array.from({ length: 50 }, (_, index) => ({
          ...value.plan.reviews[0]!,
          filename: `review-${index}.json`
        }))
      }
    };
    Object.assign(window.graiderUI, { chooseReviewImport: vi.fn().mockResolvedValue(batch) });
    await open();
    expect(document.querySelectorAll("details")).toHaveLength(50);
    expect(document.querySelectorAll("details[open]")).toHaveLength(0);
    expect(document.querySelector(".review-import__list")).toBeInTheDocument();
  });
  it("reports planning errors without changing grading", async () => {
    Object.assign(window.graiderUI, {
      chooseReviewImport: vi.fn().mockRejectedValue(new Error("Context unavailable"))
    });
    render(<ReviewImportWorkflow request={request} onApplied={vi.fn()} />);
    fireEvent.click(screen.getByText("Import Reviews..."));
    expect(await screen.findByRole("alert")).toHaveTextContent("Context unavailable");
  });
});
