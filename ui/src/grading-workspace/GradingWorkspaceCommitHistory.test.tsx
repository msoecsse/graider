import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  GradingStudentCommitHistoryResult,
  GradingStudentEvidenceResult,
  GradingWorkspacePrepareRequest
} from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({ studentId }: { studentId: string }) => (
    <div data-testid="mock-monaco">Source for {studentId}</div>
  )
}));

import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST: GradingWorkspacePrepareRequest = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};
const students = [
  { studentId: "ada", section: "001", gradingStatus: "not_started" },
  { studentId: "grace", section: "002", gradingStatus: "complete" }
];
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLDER_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const history = (
  studentId: string,
  commits = [
    {
      sha: SHA,
      committedAt: "2026-09-11T10:15:30-05:00",
      message: "Newest <img src=x onerror=alert(1)>"
    },
    {
      sha: OLDER_SHA,
      committedAt: "2026-09-10T09:00:00-05:00",
      message: "Older commit"
    }
  ]
): Extract<GradingStudentCommitHistoryResult, { readonly status: "success" }> => ({
  status: "success",
  studentId,
  submissionCommitSha: SHA,
  commits
});

const source = (studentId: string) => ({
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
});

const snapshot = (
  studentId: string,
  gradingStatus: "not_started" | "in_progress" | "complete" | "published" = "not_started"
) => ({
  status: "success" as const,
  studentId,
  gradingStatus,
  appliedComments: [],
  manualAdjustments: [],
  grade: {
    pointsPossible: 100,
    totalScore: 100,
    categories: [],
    uncategorizedCommentAdjustmentTotal: 0
  }
});

const managedEvidence = (
  studentId: string
): Extract<GradingStudentEvidenceResult, { readonly status: "success" }> => ({
  status: "success",
  studentId,
  submissionCommitSha: SHA,
  runId: 10,
  runAttempt: 1,
  evidence: {
    metadata: {
      schemaVersion: 1,
      submissionCommitSha: SHA,
      workflowRunId: "10",
      workflowRunAttempt: "1",
      compile: { outcome: "success" },
      junit: { outcome: "success" },
      checkstyle: { outcome: "success" }
    },
    junit: {
      available: true,
      outcome: "success",
      summary: { total: 1, passed: 1, failed: 0, errors: 0, skipped: 0 },
      failures: []
    },
    checkstyle: {
      available: true,
      outcome: "success",
      violationCount: 0,
      violations: []
    }
  }
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const setApis = ({
  loadHistory,
  loadSource = vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(snapshot(studentId))
  ),
  loadEvidence = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(managedEvidence(studentId))
  )
}: {
  readonly loadHistory: ReturnType<typeof vi.fn>;
  readonly loadSource?: ReturnType<typeof vi.fn>;
  readonly loadSnapshot?: ReturnType<typeof vi.fn>;
  readonly loadEvidence?: ReturnType<typeof vi.fn>;
}) => {
  const mutations = {
    addGradingStudentComment: vi.fn(),
    editGradingStudentComment: vi.fn(),
    deleteGradingStudentComment: vi.fn(),
    addGradingStudentManualAdjustment: vi.fn(),
    editGradingStudentManualAdjustment: vi.fn(),
    deleteGradingStudentManualAdjustment: vi.fn(),
    markGradingStudentComplete: vi.fn()
  };
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: ["src/Main.java"],
      rubric: [],
      students
    }),
    loadGradingStudentSource: loadSource,
    loadGradingStudentViewState: vi
      .fn()
      .mockImplementation(({ studentId }: { studentId: string }) =>
        Promise.resolve({
          status: "success",
          studentId,
          submissionCommitSha: SHA,
          gradingStatus: "not_started",
          viewState: null
        })
      ),
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingStudentEvidence: loadEvidence,
    loadGradingStudentCommitHistory: loadHistory,
    loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
    ...mutations
  });
  return { loadSource, loadSnapshot, loadEvidence, mutations };
};

describe("GradingWorkspacePage commit history", () => {
  it("loads canonical identity independently and renders trusted commits in supplied order", async () => {
    const pendingSource = deferred<ReturnType<typeof source>>();
    const pendingSnapshot = deferred<ReturnType<typeof snapshot>>();
    const pendingEvidence = deferred<GradingStudentEvidenceResult>();
    const loadHistory = vi.fn().mockResolvedValue(history("ada"));
    setApis({
      loadHistory,
      loadSource: vi.fn().mockReturnValue(pendingSource.promise),
      loadSnapshot: vi.fn().mockReturnValue(pendingSnapshot.promise),
      loadEvidence: vi.fn().mockReturnValue(pendingEvidence.promise)
    });

    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Commit History" });
    expect(panel.previousElementSibling).toBe(
      screen.getByRole("region", { name: "Automated Checks" })
    );
    expect(loadHistory).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(loadHistory.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    const items = within(panel).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Newest <img src=x onerror=alert(1)>");
    expect(items[1]).toHaveTextContent("Older commit");
    expect(items[0]).toHaveTextContent("01234567");
    expect(items[1]).toHaveTextContent("aaaaaaaa");
    expect(within(items[0]!).getByLabelText(`Commit ${SHA}`)).toHaveAttribute("title", SHA);
    expect(items[0]!.querySelector("img")).toBeNull();
    expect(items[0]!.querySelector("a")).toBeNull();
    expect(items[0]!.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-09-11T10:15:30-05:00"
    );
  });

  it("clears A immediately and ignores stale A success and failure after selecting B", async () => {
    const ada = deferred<GradingStudentCommitHistoryResult>();
    const grace = deferred<GradingStudentCommitHistoryResult>();
    const loadHistory = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada" ? ada.promise : grace.promise
    );
    setApis({ loadHistory });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByText("Loading commit history for grace…")).toBeInTheDocument();
    await act(async () => grace.resolve(history("grace")));
    expect(await screen.findByText("Commit history for grace")).toBeInTheDocument();
    await act(async () => ada.resolve(history("ada")));
    expect(screen.getByText("Commit history for grace")).toBeInTheDocument();
    expect(screen.queryByText("Commit history for ada")).not.toBeInTheDocument();

    const oldFailure = deferred<GradingStudentCommitHistoryResult>();
    loadHistory.mockImplementationOnce(() => oldFailure.promise);
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    await waitFor(() => expect(loadHistory).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("Commit history for grace");
    await act(async () => oldFailure.reject(new Error("private stale error")));
    expect(screen.getByText("Commit history for grace")).toBeInTheDocument();
    expect(screen.queryByText(/could not be loaded safely/u)).not.toBeInTheDocument();
  });

  it("reloads on A to B to A reselection without caching or mixing history", async () => {
    const reloadedAda = deferred<GradingStudentCommitHistoryResult>();
    const loadHistory = vi
      .fn()
      .mockResolvedValueOnce(history("ada"))
      .mockResolvedValueOnce(history("grace"))
      .mockReturnValueOnce(reloadedAda.promise);
    setApis({ loadHistory });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    await screen.findByText("Commit history for ada");
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("Commit history for grace");
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    expect(await screen.findByText("Loading commit history for ada…")).toBeInTheDocument();
    expect(screen.queryByText("Commit history for grace")).not.toBeInTheDocument();
    expect(loadHistory).toHaveBeenCalledTimes(3);
    await act(async () => reloadedAda.resolve(history("ada")));
    expect(await screen.findByText("Commit history for ada")).toBeInTheDocument();
  });

  it("shows an empty successful history neutrally", async () => {
    setApis({ loadHistory: vi.fn().mockResolvedValue(history("ada", [])) });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    expect(await screen.findByText("No commits available.")).toBeInTheDocument();
  });

  it.each([
    ["repository_not_recorded", "Commit history is unavailable for this submission."],
    ["repository_unavailable", "Commit history is unavailable for this submission."],
    ["submission_commit_unavailable", "Commit history is unavailable for this submission."],
    ["commit_history_unavailable", "Commit history is unavailable for this submission."],
    ["faculty_identity_required", "Commit history could not be loaded safely."],
    ["submission_changed", "different local submission"]
  ] as const)("maps %s to a safe non-blocking state", async (status, message) => {
    setApis({ loadHistory: vi.fn().mockResolvedValue({ status, studentId: "ada" }) });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    const panel = await screen.findByRole("region", { name: "Commit History" });
    expect(panel).toHaveTextContent(message);
    expect(panel.querySelector("ol")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });

  it("keeps history failures independent while automated checks and grading remain functional", async () => {
    const loadHistory = vi.fn().mockRejectedValue(new Error("raw path and git stderr"));
    const { loadSource, loadSnapshot, loadEvidence, mutations } = setApis({ loadHistory });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    expect(
      await screen.findByText("Commit history could not be loaded safely.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("Source for ada");
    expect(screen.getByRole("region", { name: "Automated Checks" })).toHaveTextContent(
      "All reported tests passed."
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload automated checks" }));
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(2));
    expect(loadHistory).toHaveBeenCalledTimes(1);
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Comment library")).toBeInTheDocument();
    for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();
  });

  it.each(["not_started", "in_progress", "complete", "published"] as const)(
    "shows history without changing %s grading status",
    async (gradingStatus) => {
      const { mutations } = setApis({
        loadHistory: vi.fn().mockResolvedValue(history("ada")),
        loadSnapshot: vi.fn().mockResolvedValue(snapshot("ada", gradingStatus))
      });
      render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
      await screen.findByText("Commit history for ada");
      expect(
        screen.getByText(
          {
            not_started: "Not Started",
            in_progress: "In Progress",
            complete: "Complete",
            published: "Published"
          }[gradingStatus],
          { selector: ".grading-student-snapshot strong" }
        )
      ).toBeInTheDocument();
      for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();
    }
  );
});
