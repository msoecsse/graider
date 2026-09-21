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

const openPublishReview = async (): Promise<void> => {
  fireEvent.click(await screen.findByRole("button", { name: /^Publish \d+ reports?$/u }));
  await screen.findByRole("heading", { name: "Publish review" });
};

describe("GradingWorkspacePage publish review", () => {
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
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    expect(screen.getByRole("checkbox", { name: "Select ada to publish" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select grace to publish" })).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "Select linus to publish" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Select margaret to publish" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 reports will be committed to 2 repositories.")).toBeInTheDocument();
    expect(document.querySelector(".grading-publish-review__published-row")).toHaveTextContent(
      "linus · Section 003 · Published"
    );
    expect(screen.getByText("2 students not graded yet.", { exact: false })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bulkPublish).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
  });

  it("publishes only the students left selected, leaving the rest untouched", async () => {
    const { bulkPublish } = configure({
      statuses: { ada: "complete", grace: "complete" }
    });
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select grace to publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 report" }));

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

  it("toggling a checkbox reads its checked value before updating selection, and does not crash", async () => {
    configure({ statuses: { ada: "complete", grace: "complete" } });
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    const graceCheckbox = screen.getByRole("checkbox", { name: "Select grace to publish" });
    expect(graceCheckbox).toBeChecked();

    fireEvent.click(graceCheckbox);
    expect(graceCheckbox).not.toBeChecked();
    expect(screen.getByText("1 report will be committed to 1 repository.")).toBeInTheDocument();

    fireEvent.click(graceCheckbox);
    expect(graceCheckbox).toBeChecked();
    expect(screen.getByText("2 reports will be committed to 2 repositories.")).toBeInTheDocument();
  });

  it("stops dispatching further snapshot fetches once the review is cancelled", async () => {
    const pending = deferred<ReturnType<typeof snapshot>>();
    const loadSnapshot = vi.fn().mockReturnValue(pending.promise);
    configure({
      statuses: {
        s1: "complete",
        s2: "complete",
        s3: "complete",
        s4: "complete",
        s5: "complete",
        s6: "complete",
        s7: "complete"
      },
      loadSnapshot
    });
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    // The concurrency bound keeps some of the 7 ready students queued rather
    // than dispatching all of them (plus the selected student's own snapshot
    // load) at once.
    await waitFor(() => expect(loadSnapshot.mock.calls.length).toBeGreaterThan(1));
    const callsWhileOpen = loadSnapshot.mock.calls.length;
    expect(callsWhileOpen).toBeLessThan(8);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await act(async () => {
      pending.resolve(snapshot("s1", "complete"));
    });

    expect(loadSnapshot.mock.calls.length).toBe(callsWhileOpen);
  });

  it("flushes the current student's pending view state before one bulk call", async () => {
    const save = deferred<ReturnType<typeof snapshot> & { viewState: GradingEditorViewState }>();
    const saveViewState = vi.fn().mockReturnValue(save.promise);
    const { bulkPublish } = configure({
      statuses: { ada: "complete", grace: "complete" },
      saveViewState
    });
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Move ada" }));
    await openPublishReview();
    fireEvent.click(screen.getByRole("button", { name: "Publish 2 reports" }));
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

  it("shows per-student outcomes naming who failed and why, continues past failures, and refreshes statuses authoritatively", async () => {
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
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    fireEvent.click(screen.getByRole("button", { name: "Publish 3 reports" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Already published (1)" })).toBeInTheDocument()
    );
    const adaWarning = screen.getByText("The report was published without commit history.");
    const adaRow = adaWarning.closest(".grading-publish-review__published-row");
    expect(adaRow).toHaveTextContent("ada · Section 001 · Published");
    expect(adaRow).toHaveTextContent("Published with warnings");

    const graceRow = screen
      .getByRole("checkbox", { name: "Select grace to publish" })
      .closest("tr");
    expect(graceRow).toHaveTextContent(
      "Failed: Graider cannot publish the report because the GitHub token lacks repository Contents write permission."
    );
    const linusRow = screen
      .getByRole("checkbox", { name: "Select linus to publish" })
      .closest("tr");
    expect(linusRow).toHaveTextContent("Publication stale");

    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "grace" });
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "linus" });
  });

  it("shows the empty state when there are no completed reports ready to publish", async () => {
    configure({ statuses: { ada: "published", grace: "in_progress" } });
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();

    expect(screen.getByText("No completed reports are ready to publish.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish 0 reports" })).toBeDisabled();
  });
});
