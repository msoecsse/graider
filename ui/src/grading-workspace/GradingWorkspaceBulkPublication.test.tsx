import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingEditorViewState, GradingWorkspacePrepareRequest } from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({
    onCanonicalViewStateChange,
    studentId
  }: {
    onCanonicalViewStateChange?: (viewState: GradingEditorViewState) => void;
    studentId: string;
  }) => (
    <button
      type="button"
      onClick={() =>
        onCanonicalViewStateChange?.({
          scrollTop: 12,
          cursor: { file: "src/Main.java", line: 1, column: 1 }
        })
      }
    >
      Move {studentId}
    </button>
  )
}));

import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST: GradingWorkspacePrepareRequest = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};

type GradingStatus = "not_started" | "in_progress" | "complete" | "published";

const snapshot = (studentId: string, gradingStatus: GradingStatus) => ({
  status: "success" as const,
  studentId,
  gradingStatus,
  appliedComments: [],
  manualAdjustments: [],
  grade: {
    pointsPossible: 10,
    totalScore: 10,
    categories: [],
    uncategorizedCommentAdjustmentTotal: 0
  }
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const configure = ({
  statuses,
  bulkPublish = vi.fn().mockResolvedValue({ status: "success", results: [] }),
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(snapshot(studentId, statuses[studentId] ?? "complete"))
  ),
  saveViewState = vi.fn(({ studentId, viewState }) =>
    Promise.resolve({
      status: "success",
      studentId,
      submissionCommitSha: "a".repeat(40),
      gradingStatus: statuses[studentId] ?? "complete",
      viewState
    })
  )
}: {
  statuses: Readonly<Record<string, GradingStatus>>;
  bulkPublish?: ReturnType<typeof vi.fn>;
  loadSnapshot?: ReturnType<typeof vi.fn>;
  saveViewState?: ReturnType<typeof vi.fn>;
}) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric: [],
      students: Object.entries(statuses).map(([studentId, gradingStatus], index) => ({
        studentId,
        section: String(index + 1).padStart(3, "0"),
        gradingStatus
      }))
    }),
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        combinedText: `class ${studentId} {}`,
        syntheticCombinedLines: [],
        sections: [
          {
            status: "found",
            file: "src/Main.java",
            sourceText: `class ${studentId} {}`,
            sourceLineCount: 1,
            combinedStartLine: 1,
            combinedEndLine: 1,
            insertionLine: 1
          }
        ]
      })
    ),
    loadGradingStudentViewState: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: statuses[studentId] ?? "complete",
        viewState: null
      })
    ),
    saveGradingStudentViewState: saveViewState,
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
    bulkPublishGradingStudentReports: bulkPublish
  });
  return { bulkPublish, loadSnapshot, saveViewState };
};

describe("GradingWorkspacePage bulk report publication", () => {
  it("selects Complete students by default and excludes Published and unfinished students", async () => {
    const { bulkPublish } = configure({
      statuses: {
        ada: "complete",
        grace: "complete",
        linus: "published",
        margaret: "in_progress",
        edsger: "not_started"
      }
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Completed Reports" }));
    expect(screen.getByRole("checkbox", { name: "ada" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "grace" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "linus" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "margaret" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("2 completed reports");

    fireEvent.click(screen.getByRole("checkbox", { name: "grace" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bulkPublish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Publish Completed Reports" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "grace" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Reports" }));
    await waitFor(() => expect(bulkPublish).toHaveBeenCalledTimes(1));
    expect(bulkPublish).toHaveBeenCalledWith({ ...REQUEST, studentIds: ["ada"] });
    expect(Object.keys(bulkPublish.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentIds",
      "termCode"
    ]);
  });

  it("flushes the current student's pending view state before one bulk call", async () => {
    const save = deferred<ReturnType<typeof snapshot> & { viewState: GradingEditorViewState }>();
    const saveViewState = vi.fn().mockReturnValue(save.promise);
    const { bulkPublish } = configure({
      statuses: { ada: "complete", grace: "complete" },
      saveViewState
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Move ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish Completed Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Reports" }));
    await waitFor(() => expect(saveViewState).toHaveBeenCalledTimes(1));
    expect(bulkPublish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Publishing 2 reports…" })).toBeDisabled();

    await act(async () =>
      save.resolve({
        ...snapshot("ada", "complete"),
        viewState: { scrollTop: 12, cursor: { file: "src/Main.java", line: 1, column: 1 } }
      })
    );
    await waitFor(() => expect(bulkPublish).toHaveBeenCalledTimes(1));
  });

  it("shows ordered per-student outcomes, continues failures, and refreshes statuses authoritatively", async () => {
    let bulkFinished = false;
    const bulkPublish = vi.fn().mockImplementation(async () => {
      bulkFinished = true;
      return {
        status: "success",
        results: [
          {
            studentId: "ada",
            result: {
              status: "success",
              studentId: "ada",
              gradingStatus: "published",
              reportPath: "grading/report.html",
              remoteWrite: "created_or_updated",
              warnings: ["commit_history_unavailable"]
            }
          },
          { studentId: "grace", result: { status: "report_write_permission_unavailable" } },
          {
            studentId: "linus",
            result: {
              status: "publication_stale",
              studentId: "linus",
              remoteReportPublished: false
            }
          }
        ]
      };
    });
    const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve(
        snapshot(studentId, bulkFinished && studentId === "ada" ? "published" : "complete")
      )
    );
    configure({
      statuses: { ada: "complete", grace: "complete", linus: "complete" },
      bulkPublish,
      loadSnapshot
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Completed Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Reports" }));

    expect(
      await screen.findByText("0 published · 1 published with warnings · 2 failed")
    ).toBeInTheDocument();
    const results = screen.getByRole("status");
    expect(results).toHaveTextContent("ada — Published with warnings");
    expect(results).toHaveTextContent("grace — Failed: Graider cannot publish the report");
    expect(results).toHaveTextContent("linus — Publication stale");
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "grace" });
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "linus" });
    expect(
      screen.getByRole("button", { name: /ada · Section 001 · Published/u })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Republish Report" })).toBeEnabled();
  });

  it("disables bulk publication when no Complete students exist", async () => {
    configure({ statuses: { ada: "published", grace: "in_progress" } });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Publish Completed Reports" })).toBeDisabled();
    expect(screen.getByText("No completed reports are ready to publish.")).toBeInTheDocument();
  });
});
