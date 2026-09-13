import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
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

const evidence = (
  studentId: string,
  options: {
    readonly junitOutcome?: "success" | "failure" | "skipped";
    readonly checkstyleOutcome?: "success" | "failure" | "skipped";
    readonly emptySuccessfulEvidence?: boolean;
  } = {}
): Extract<GradingStudentEvidenceResult, { readonly status: "success" }> => ({
  status: "success",
  studentId,
  submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
  runId: 10,
  runAttempt: 2,
  evidence: {
    metadata: {
      schemaVersion: 1,
      submissionCommitSha: "0123456789abcdef0123456789abcdef01234567",
      workflowRunId: "10",
      workflowRunAttempt: "2",
      compile: { outcome: "success" },
      junit: { outcome: options.junitOutcome ?? "failure" },
      checkstyle: { outcome: options.checkstyleOutcome ?? "failure" }
    },
    junit: {
      available: true,
      outcome: options.junitOutcome ?? "failure",
      summary: options.emptySuccessfulEvidence
        ? { total: 4, passed: 4, failed: 0, errors: 0, skipped: 0 }
        : { total: 6, passed: 3, failed: 1, errors: 1, skipped: 1 },
      failures: options.emptySuccessfulEvidence
        ? []
        : [
            {
              name: "rejects markup",
              className: "ExampleTest",
              kind: "failure",
              message: "<img src=x onerror=alert(1)>",
              details: "expected <safe> but was &unsafe"
            },
            { name: "throws safely", kind: "error", message: "Illegal state" }
          ]
    },
    checkstyle: {
      available: true,
      outcome: options.checkstyleOutcome ?? "failure",
      violationCount: options.emptySuccessfulEvidence ? 0 : 2,
      violations: options.emptySuccessfulEvidence
        ? []
        : [
            {
              file: "src/Main.java",
              fileKind: "repository_relative",
              line: 7,
              column: 3,
              severity: "warning",
              message: "Missing a Javadoc comment.",
              source: "JavadocType"
            },
            {
              file: "/workspace/generated.java",
              fileKind: "noncanonical",
              line: 2,
              severity: "error",
              message: "Noncanonical finding"
            }
          ]
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
  loadEvidence,
  loadSource = vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
  loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
    Promise.resolve(snapshot(studentId))
  )
}: {
  readonly loadEvidence: ReturnType<typeof vi.fn>;
  readonly loadSource?: ReturnType<typeof vi.fn>;
  readonly loadSnapshot?: ReturnType<typeof vi.fn>;
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
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "not_started",
          viewState: null
        })
      ),
    loadGradingStudentSnapshot: loadSnapshot,
    loadGradingStudentEvidence: loadEvidence,
    loadGradingCommentLibrary: vi.fn().mockResolvedValue({ status: "success", comments: [] }),
    ...mutations
  });
  return { loadSource, loadSnapshot, mutations };
};

describe("GradingWorkspacePage automated checks", () => {
  it("loads independently with canonical identity and renders normalized JUnit and Checkstyle", async () => {
    const pendingSource = deferred<ReturnType<typeof source>>();
    const pendingSnapshot = deferred<ReturnType<typeof snapshot>>();
    const loadEvidence = vi.fn().mockResolvedValue(evidence("ada"));
    setApis({
      loadEvidence,
      loadSource: vi.fn().mockReturnValue(pendingSource.promise),
      loadSnapshot: vi.fn().mockReturnValue(pendingSnapshot.promise)
    });

    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Automated Checks" });
    expect(loadEvidence).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(loadEvidence.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    expect(panel).toHaveTextContent("CompilePassed");
    expect(panel).toHaveTextContent("Unit TestsFailed");
    expect(panel).toHaveTextContent("Total6Passed3Failed1Errors1Skipped1");
    expect(panel).toHaveTextContent("ExampleTest · rejects markup");
    expect(panel).toHaveTextContent("Failure");
    expect(panel).toHaveTextContent("Error");
    expect(panel).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(panel).toHaveTextContent("expected <safe> but was &unsafe");
    expect(panel.querySelector("img")).toBeNull();
    expect(panel).toHaveTextContent("CheckstyleFailed");
    expect(panel).toHaveTextContent("2 violations");
    expect(panel).toHaveTextContent("src/Main.java:7:3");
    expect(panel).toHaveTextContent("warning");
    expect(panel).toHaveTextContent("JavadocType");
    expect(panel).toHaveTextContent("Noncanonical location: /workspace/generated.java:2");
  });

  it("ignores stale success and failure responses when switching students", async () => {
    const ada = deferred<GradingStudentEvidenceResult>();
    const grace = deferred<GradingStudentEvidenceResult>();
    const loadEvidence = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada" ? ada.promise : grace.promise
    );
    setApis({ loadEvidence });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(2));
    await act(async () => grace.resolve(evidence("grace")));
    expect(await screen.findByText("Automated checks for grace")).toBeInTheDocument();
    await act(async () => ada.resolve(evidence("ada")));
    expect(screen.getByText("Automated checks for grace")).toBeInTheDocument();
    expect(screen.queryByText("Automated checks for ada")).not.toBeInTheDocument();

    const oldFailure = deferred<GradingStudentEvidenceResult>();
    loadEvidence.mockImplementationOnce(() => oldFailure.promise);
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    await waitFor(() => expect(loadEvidence).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("Automated checks for grace");
    await act(async () => oldFailure.reject(new Error("stale private error")));
    expect(screen.getByText("Automated checks for grace")).toBeInTheDocument();
    expect(screen.queryByText(/could not be trusted or read/u)).not.toBeInTheDocument();
  });

  it("clears previous evidence, reloads A to B to A, and never caches student evidence", async () => {
    const reloadedAda = deferred<GradingStudentEvidenceResult>();
    const loadEvidence = vi
      .fn()
      .mockResolvedValueOnce(evidence("ada"))
      .mockResolvedValueOnce(evidence("grace"))
      .mockReturnValueOnce(reloadedAda.promise);
    setApis({ loadEvidence });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    await screen.findByText("Automated checks for ada");
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("Automated checks for grace");
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));

    expect(await screen.findByText("Loading automated checks for ada…")).toBeInTheDocument();
    expect(screen.queryByText("Automated checks for grace")).not.toBeInTheDocument();
    expect(loadEvidence).toHaveBeenCalledTimes(3);
    await act(async () => reloadedAda.resolve(evidence("ada")));
    expect(await screen.findByText("Automated checks for ada")).toBeInTheDocument();
  });

  it("reloads only evidence and ignores a stale reload after selecting another student", async () => {
    const staleReload = deferred<GradingStudentEvidenceResult>();
    const loadEvidence = vi
      .fn()
      .mockResolvedValueOnce(evidence("ada"))
      .mockReturnValueOnce(staleReload.promise)
      .mockResolvedValueOnce(evidence("grace"));
    const { loadSource, loadSnapshot, mutations } = setApis({ loadEvidence });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reload automated checks" }));
    expect(screen.getByRole("button", { name: "Reload automated checks" })).toBeDisabled();
    expect(loadEvidence).toHaveBeenCalledTimes(2);
    expect(loadSource).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    for (const mutation of Object.values(mutations)) expect(mutation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByText("Automated checks for grace")).toBeInTheDocument();
    await act(async () => staleReload.resolve(evidence("ada")));
    expect(screen.getByText("Automated checks for grace")).toBeInTheDocument();
    expect(screen.queryByText("Automated checks for ada")).not.toBeInTheDocument();
  });

  it("keeps evidence failures independent from ordinary source and grading", async () => {
    setApis({ loadEvidence: vi.fn().mockRejectedValue(new Error("raw private failure")) });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("Source for ada");
    expect(
      await screen.findByText("Not Started", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Automated Checks" })).toHaveTextContent(
      "Automated evidence could not be trusted or read. You can continue grading."
    );
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });

  it("shows all-pass and zero-violation states only alongside successful phase outcomes", async () => {
    const successful = evidence("ada", {
      junitOutcome: "success",
      checkstyleOutcome: "success",
      emptySuccessfulEvidence: true
    });
    setApis({ loadEvidence: vi.fn().mockResolvedValue(successful) });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    const panel = await screen.findByRole("region", { name: "Automated Checks" });
    expect(panel).toHaveTextContent("All reported tests passed.");
    expect(panel).toHaveTextContent("No Checkstyle violations reported.");

    const failedEmpty = evidence("ada", {
      junitOutcome: "failure",
      emptySuccessfulEvidence: true
    });
    const loadEvidence = vi.fn().mockResolvedValue(failedEmpty);
    setApis({ loadEvidence });
    fireEvent.click(screen.getByRole("button", { name: "Reload automated checks" }));
    await waitFor(() => expect(panel).toHaveTextContent("Unit TestsFailed"));
    expect(panel).not.toHaveTextContent("All reported tests passed.");
  });

  it.each([
    ["workflow_run_not_found", "No automated results are available yet."],
    [
      "evidence_artifact_missing",
      "Automated results were produced, but the grading evidence artifact is unavailable."
    ],
    ["evidence_artifact_expired", "The grading evidence artifact has expired."],
    [
      "actions_forbidden",
      "Graider cannot read grading evidence from GitHub Actions. Check the configured GitHub token's Actions read permission."
    ],
    ["metadata_invalid", "Automated evidence could not be trusted or read."],
    [
      "evidence_identity_mismatch",
      "Automated evidence did not match this submission and was not shown."
    ]
  ] as const)("maps %s to a safe faculty-facing state", async (code, message) => {
    setApis({
      loadEvidence: vi.fn().mockResolvedValue({ status: "evidence_error", studentId: "ada", code })
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    expect(
      await screen.findByText(new RegExp(message.replaceAll(".", "\\."), "u"))
    ).toBeInTheDocument();
    expect(screen.queryByText("Automated checks for ada")).not.toBeInTheDocument();
  });

  it.each([
    ["submission_changed", "different local submission"],
    ["repository_not_recorded", "Automated evidence is unavailable for this student."],
    ["repository_unavailable", "Automated evidence is unavailable for this student."],
    ["submission_commit_unavailable", "Automated evidence is unavailable for this student."]
  ] as const)("handles %s without blocking grading", async (status, message) => {
    setApis({
      loadEvidence: vi.fn().mockResolvedValue({ status, studentId: "ada" })
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    expect(await screen.findByText(new RegExp(message, "u"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });

  it("hides not-applicable managed evidence without presenting custom workflows as broken", async () => {
    setApis({
      loadEvidence: vi.fn().mockResolvedValue({ status: "not_applicable", studentId: "ada" })
    });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    await screen.findByTestId("mock-monaco");
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Automated Checks" })).not.toBeInTheDocument()
    );
    expect(screen.queryByText(/workflow|artifact|evidence/iu)).not.toBeInTheDocument();
  });

  it.each(["not_started", "in_progress", "complete", "published"] as const)(
    "shows evidence without changing %s grading status",
    async (gradingStatus) => {
      const loadSnapshot = vi.fn().mockResolvedValue(snapshot("ada", gradingStatus));
      const { mutations } = setApis({
        loadEvidence: vi.fn().mockResolvedValue(evidence("ada")),
        loadSnapshot
      });
      render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
      await screen.findByText("Automated checks for ada");
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
