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
          scrollTop: 25,
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

const studentSnapshot = (studentId: string, gradingStatus: GradingStatus) => ({
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

const configureApis = ({
  statuses = { ada: "complete" },
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(studentSnapshot(studentId, statuses[studentId] ?? "complete"))
  ),
  saveViewState = vi.fn(({ studentId, viewState }) =>
    Promise.resolve({
      status: "success",
      studentId,
      submissionCommitSha: "a".repeat(40),
      gradingStatus: statuses[studentId] ?? "complete",
      viewState
    })
  ),
  publish = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    gradingStatus: "published",
    reportPath: "grading/report.html",
    remoteWrite: "created_or_updated",
    warnings: []
  }),
  preview = vi.fn().mockResolvedValue({
    status: "success",
    studentId: "ada",
    html: "<!doctype html><html><body><h1>Preview</h1></body></html>",
    warnings: []
  })
}: {
  statuses?: Readonly<Record<string, GradingStatus>>;
  loadSnapshot?: ReturnType<typeof vi.fn>;
  saveViewState?: ReturnType<typeof vi.fn>;
  publish?: ReturnType<typeof vi.fn>;
  preview?: ReturnType<typeof vi.fn>;
} = {}) => {
  const students = Object.entries(statuses).map(([studentId, gradingStatus], index) => ({
    studentId,
    section: String(index + 1).padStart(3, "0"),
    gradingStatus
  }));
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric: [],
      students
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
    previewGradingStudentReport: preview,
    publishGradingStudentReport: publish
  });
  return { loadSnapshot, preview, publish, saveViewState };
};

const showAllStudents = async (): Promise<void> => {
  const pill =
    screen.queryByRole("button", { name: /^All\b/u }) ??
    (await screen.findByRole("button", { name: /^All\b/u }));
  fireEvent.click(pill);
};

describe("GradingWorkspacePage report publication", () => {
  it("shows publication controls only for Complete and Published students", async () => {
    configureApis({
      statuses: {
        ada: "not_started",
        grace: "in_progress",
        linus: "complete",
        margaret: "published"
      }
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    await screen.findByText("Status:");
    expect(screen.queryByRole("button", { name: /Publish Report/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("In Progress");
    expect(screen.queryByRole("button", { name: /Publish Report/u })).not.toBeInTheDocument();

    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /linus · Section 003/u }));
    expect(await screen.findByRole("button", { name: "Preview Report" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Publish Report" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /margaret · Section 004/u }));
    expect(await screen.findByRole("button", { name: "Republish Report" })).toBeEnabled();
  });

  it("previews the trusted HTML with warnings and closes without publication", async () => {
    const { preview, publish } = configureApis({
      preview: vi.fn().mockResolvedValue({
        status: "success",
        studentId: "ada",
        html: "<!doctype html><html><body><h1>Trusted Preview</h1></body></html>",
        warnings: ["automated_evidence_unavailable", "commit_history_unavailable"]
      })
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview Report" }));
    await waitFor(() => expect(preview).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" }));
    expect(Object.keys(preview.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    const dialog = await screen.findByRole("dialog", { name: "Report Preview" });
    const frame = screen.getByTitle("Grading report preview");
    expect(frame).toHaveAttribute("srcdoc", expect.stringContaining("Trusted Preview"));
    expect(dialog).toHaveTextContent("Automated evidence is unavailable and will be omitted.");
    expect(dialog).toHaveTextContent("Commit history is unavailable and will be omitted.");
    expect(publish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Report Preview" })).not.toBeInTheDocument();
    expect(publish).not.toHaveBeenCalled();
  });

  it("prevents duplicate preview requests while a preview is pending", async () => {
    const pending = deferred<{
      status: "success";
      studentId: "ada";
      html: string;
      warnings: readonly [];
    }>();
    const { preview } = configureApis({ preview: vi.fn().mockReturnValue(pending.promise) });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const button = await screen.findByRole("button", { name: "Preview Report" });
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Preparing Preview…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preparing Preview…" }));
    expect(preview).toHaveBeenCalledOnce();

    await act(async () =>
      pending.resolve({
        status: "success",
        studentId: "ada",
        html: "<!doctype html><p>ready</p>",
        warnings: []
      })
    );
  });

  it("does not show a stale preview after switching students", async () => {
    const pending = deferred<{
      status: "success";
      studentId: "ada";
      html: string;
      warnings: readonly [];
    }>();
    const { preview } = configureApis({
      statuses: { ada: "complete", grace: "complete" },
      preview: vi.fn().mockReturnValue(pending.promise)
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Preview Report" }));
    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await act(async () =>
      pending.resolve({
        status: "success",
        studentId: "ada",
        html: "<!doctype html><p>stale</p>",
        warnings: []
      })
    );
    expect(screen.queryByRole("dialog", { name: "Report Preview" })).not.toBeInTheDocument();
  });

  it("requires confirmation and sends only canonical identity", async () => {
    const { publish } = configureApis();
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Report" }));
    const dialog = screen.getByRole("dialog", { name: "Publish grading report?" });
    expect(dialog).toHaveTextContent(
      "This will write the completed grading report to the student's repository."
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(publish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Publish Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(publish).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(publish.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
  });

  it("flushes view state before publishing and then reloads the authoritative Published snapshot", async () => {
    const save = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "complete";
      viewState: GradingEditorViewState;
    }>();
    const saveViewState = vi.fn().mockReturnValue(save.promise);
    let snapshotLoads = 0;
    const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) => {
      snapshotLoads += 1;
      return Promise.resolve(
        studentSnapshot(studentId, snapshotLoads === 1 ? "complete" : "published")
      );
    });
    const { publish } = configureApis({ loadSnapshot, saveViewState });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Move ada" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));
    await waitFor(() => expect(saveViewState).toHaveBeenCalledTimes(1));
    expect(publish).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();

    await act(async () =>
      save.resolve({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "complete",
        viewState: { scrollTop: 25, cursor: { file: "src/Main.java", line: 1, column: 1 } }
      })
    );
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Published to grading/report.html.")).toBeInTheDocument();
    expect(
      screen.getByText("Published", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Republish Report" })).toBeEnabled();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it("treats a no-op republish with informational warnings as successful", async () => {
    let snapshotLoads = 0;
    const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) => {
      snapshotLoads += 1;
      return Promise.resolve(studentSnapshot(studentId, "published"));
    });
    const publish = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "published",
      reportPath: "feedback/custom.html",
      remoteWrite: "unchanged",
      warnings: ["automated_evidence_unavailable", "commit_history_unavailable"]
    });
    configureApis({ statuses: { ada: "published" }, loadSnapshot, publish });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Republish Report" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("existing Graider report may be updated");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Republish Report" }));

    expect(await screen.findByText("Published to feedback/custom.html.")).toBeInTheDocument();
    expect(
      screen.getByText("The report was published without automated evidence.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("The report was published without commit history.")
    ).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      result: {
        status: "publication_state_record_failed",
        studentId: "ada",
        reportPath: "grading/report.html",
        remoteReportPublished: true,
        warnings: []
      },
      message:
        "The report was published to the student repository, but Graider could not record the Published status. You can retry publication safely."
    },
    {
      result: { status: "publication_stale", studentId: "ada", remoteReportPublished: true },
      message: "Grading changed while publication was in progress"
    },
    {
      result: { status: "submission_changed", studentId: "ada", remoteReportPublished: false },
      message: "different local submission"
    },
    {
      result: { status: "report_write_permission_unavailable" },
      message: "Contents write permission"
    },
    {
      result: { status: "grading_not_complete", studentId: "ada" },
      message: "Mark this student's grading Complete"
    }
  ])(
    "shows a safe message for $result.status without fabricating Published",
    async ({ result, message }) => {
      const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
        Promise.resolve(studentSnapshot(studentId, "complete"))
      );
      configureApis({ loadSnapshot, publish: vi.fn().mockResolvedValue(result) });
      render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

      fireEvent.click(await screen.findByRole("button", { name: "Publish Report" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));
      expect(await screen.findByText(new RegExp(message, "u"))).toBeInTheDocument();
      expect(
        screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Published", { selector: ".grading-student-snapshot strong" })
      ).not.toBeInTheDocument();
    }
  );

  it("closes stale confirmation and ignores an old student's late publication result", async () => {
    const pending = deferred<{
      status: "success";
      studentId: "ada";
      gradingStatus: "published";
      reportPath: "grading/report.html";
      remoteWrite: "created_or_updated";
      warnings: readonly [];
    }>();
    const publish = vi.fn().mockReturnValue(pending.promise);
    configureApis({ statuses: { ada: "complete", grace: "complete" }, publish });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await screen.findByText("Status:");

    await act(async () =>
      pending.resolve({
        status: "success",
        studentId: "ada",
        gradingStatus: "published",
        reportPath: "grading/report.html",
        remoteWrite: "created_or_updated",
        warnings: []
      })
    );
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Published to grading/report.html.")).not.toBeInTheDocument();
  });

  it("reports remote success honestly when the authoritative snapshot cannot be refreshed", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(studentSnapshot("ada", "complete"))
      .mockRejectedValueOnce(new Error("private snapshot detail"));
    configureApis({ loadSnapshot });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));

    expect(
      await screen.findByText(
        "The report was published to grading/report.html, but the current grading status could not be refreshed."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/private snapshot detail/u)).not.toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish Report" })).toBeEnabled();
  });

  it("ignores an old student's late publication failure", async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<never>((_resolve, nextReject) => {
      reject = nextReject;
    });
    const publish = vi.fn().mockReturnValue(pending);
    configureApis({ statuses: { ada: "complete", grace: "complete" }, publish });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Publish Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish Report" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("Status:");

    await act(async () => reject(new Error("private backend detail")));
    expect(screen.queryByText(/private backend detail/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be published safely/u)).not.toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
  });
});
