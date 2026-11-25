import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};
const DUE = "2026-11-21T18:00:00Z";
const LATE = "2026-11-23T21:00:00Z";
const snapshot = (studentId: string, submittedAt?: string) => ({
  status: "success" as const,
  studentId,
  lastStudentWorkAt: submittedAt,
  gradingStatus: "complete" as const,
  appliedComments: [],
  manualAdjustments: [],
  grade: {
    totalScore: 95,
    pointsPossible: 100,
    categories: [],
    uncategorizedCommentAdjustmentTotal: 0
  }
});

const configure = (loadSnapshot: ReturnType<typeof vi.fn>, dueAt: string | undefined = DUE) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1", dueAt },
      requiredFiles: [],
      rubric: [],
      students: ["ada", "grace"].map((studentId) => ({
        studentId,
        section: "001",
        gradingStatus: "complete"
      }))
    }),
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        sections: [],
        combinedText: "",
        syntheticCombinedLines: []
      })
    ),
    loadGradingStudentViewState: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "complete",
        viewState: null
      })
    )
  });
};

describe("grading workspace lateness", () => {
  it("shows lateness immediately beside selected identity while preserving the saved grade", async () => {
    configure(
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(snapshot(studentId, LATE)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    expect(await screen.findByText("Late by 2 days, 3 hours")).toBeVisible();
    expect(screen.getByLabelText("Submission timing for ada")).toHaveTextContent("ada");
    expect(screen.getByRole("button", { name: "Preview Report" })).toBeEnabled();
    expect(screen.getByText("Status:").parentElement).toHaveTextContent("Complete");
    expect(screen.queryByText("Updated Since Grading")).not.toBeInTheDocument();
  });

  it("clears the previous student's lateness before the next snapshot resolves", async () => {
    let resolveGrace!: (value: ReturnType<typeof snapshot>) => void;
    const grace = new Promise<ReturnType<typeof snapshot>>((resolve) => {
      resolveGrace = resolve;
    });
    configure(
      vi.fn(({ studentId }: { studentId: string }) =>
        studentId === "ada" ? Promise.resolve(snapshot(studentId, LATE)) : grace
      )
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("Late by 2 days, 3 hours");
    fireEvent.click(screen.getByRole("button", { name: /^All\b/u }));
    fireEvent.click(screen.getByRole("button", { name: /grace · Section/u }));
    await waitFor(() =>
      expect(screen.getByLabelText("Submission timing for grace")).toHaveTextContent(
        "Submission time unavailable"
      )
    );
    expect(screen.queryByText(/Late by/u)).not.toBeInTheDocument();
    await act(async () => {
      resolveGrace(snapshot("grace", DUE));
    });
    expect(await screen.findByText("On time")).toBeVisible();
  });

  it("keeps missing local repositories neutral", async () => {
    configure(vi.fn().mockResolvedValue({ status: "repository_not_recorded" }));
    render(<GradingWorkspacePage request={REQUEST} />);
    expect(await screen.findByText("Submission time unavailable")).toBeVisible();
    expect(screen.queryByText(/Late by/u)).not.toBeInTheDocument();
  });
});
