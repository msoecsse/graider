import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GradingEditorViewState, GradingWorkspacePrepareRequest } from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({
    annotations,
    initialViewState,
    model,
    onCanonicalViewStateChange,
    onCanonicalSelectionChange,
    studentId
  }: {
    annotations?: readonly unknown[];
    initialViewState?: GradingEditorViewState | null;
    model: { combinedText: string; sections: readonly { file: string; status: string }[] };
    onCanonicalViewStateChange?: (viewState: GradingEditorViewState) => void;
    onCanonicalSelectionChange?: (
      target: { file: string; startLine: number; endLine: number } | undefined
    ) => void;
    studentId: string;
  }) => (
    <div>
      <div data-testid="mock-monaco">
        {studentId}:{model.combinedText}:
        {model.sections.map((section) => `${section.file}-${section.status}`).join(",")}:
        {JSON.stringify(initialViewState ?? null)}
      </div>
      <div data-testid="mock-annotations">{JSON.stringify(annotations ?? [])}</div>
      <button
        onClick={() =>
          onCanonicalViewStateChange?.({
            scrollTop: 10,
            cursor: { file: "src/Main.java", line: 1, column: 2 }
          })
        }
      >
        Move {studentId} once
      </button>
      <button
        onClick={() =>
          onCanonicalViewStateChange?.({
            scrollTop: 20,
            cursor: { file: "src/Main.java", line: 1, column: 4 }
          })
        }
      >
        Move {studentId} latest
      </button>
      <button
        onClick={() =>
          onCanonicalSelectionChange?.({ file: "src/Main.java", startLine: 1, endLine: 1 })
        }
      >
        Select {studentId} line
      </button>
      <button
        onClick={() =>
          onCanonicalSelectionChange?.({ file: "src/Main.java", startLine: 2, endLine: 5 })
        }
      >
        Select {studentId} range
      </button>
      <button onClick={() => onCanonicalSelectionChange?.(undefined)}>
        Select {studentId} invalid
      </button>
    </div>
  )
}));

import { GradingWorkspacePage } from "./GradingWorkspacePage";

const REQUEST: GradingWorkspacePrepareRequest = {
  courseFolderId: "course-1",
  courseFolderPath: "/trusted/course",
  termCode: "27s1",
  assignmentSlug: "lab1"
};

const workspace = (
  students = [
    { studentId: "ada", section: "001", gradingStatus: "not_started" },
    { studentId: "grace", section: "002", gradingStatus: "complete" }
  ]
) => ({
  status: "success",
  assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
  requiredFiles: ["src/Main.java"],
  rubric: [],
  students
});

const source = (studentId: string, text = `class ${studentId} {}`) => ({
  status: "success",
  studentId,
  combinedText: text,
  syntheticCombinedLines: [],
  sections: [
    {
      status: "found",
      file: "src/Main.java",
      sourceText: text,
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const setApis = (
  prepareGradingWorkspace: ReturnType<typeof vi.fn>,
  loadGradingStudentSource: ReturnType<typeof vi.fn>,
  loadGradingStudentViewState: ReturnType<typeof vi.fn> = vi
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
  saveGradingStudentViewState: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(
      ({ studentId, viewState }: { studentId: string; viewState: GradingEditorViewState }) =>
        Promise.resolve({
          status: "success",
          studentId,
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "not_started",
          viewState
        })
    ),
  loadGradingStudentSnapshot: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve(snapshot(studentId))
    ),
  loadGradingCommentLibrary: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockResolvedValue({ status: "success", comments: [] }),
  addGradingStudentComment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        appliedComments: []
      })
    ),
  editGradingStudentComment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        appliedComments: []
      })
    ),
  deleteGradingStudentComment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        appliedComments: []
      })
    ),
  addGradingStudentManualAdjustment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        manualAdjustments: []
      })
    ),
  editGradingStudentManualAdjustment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        manualAdjustments: []
      })
    ),
  deleteGradingStudentManualAdjustment: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "in_progress",
        manualAdjustments: []
      })
    ),
  markGradingStudentComplete: ReturnType<typeof vi.fn> = vi
    .fn()
    .mockImplementation(({ studentId }: { studentId: string }) =>
      Promise.resolve({ status: "success", studentId, gradingStatus: "complete" })
    )
) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace,
    loadGradingStudentSource,
    loadGradingStudentViewState,
    saveGradingStudentViewState,
    loadGradingStudentSnapshot,
    loadGradingCommentLibrary,
    addGradingStudentComment,
    editGradingStudentComment,
    deleteGradingStudentComment,
    addGradingStudentManualAdjustment,
    editGradingStudentManualAdjustment,
    deleteGradingStudentManualAdjustment,
    markGradingStudentComplete
  });
};

afterEach(() => {
  vi.useRealTimers();
});

const showAllStudents = async (): Promise<void> => {
  const pill =
    screen.queryByRole("button", { name: /^All\b/u }) ??
    (await screen.findByRole("button", { name: /^All\b/u }));
  fireEvent.click(pill);
};

describe("GradingWorkspacePage source viewer", () => {
  it("loads the first selected student using only canonical Slice 15 identity fields", async () => {
    const loadGradingStudentSource = vi.fn().mockResolvedValue(source("ada"));
    setApis(vi.fn().mockResolvedValue(workspace()), loadGradingStudentSource);

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("ada:class ada {}");
    expect(loadGradingStudentSource).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(loadGradingStudentSource.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
  });

  it("loads and supplies persisted canonical view state for the same selected identity", async () => {
    const persisted = {
      scrollTop: 88,
      cursor: { file: "src/Main.java", line: 1, column: 4 }
    };
    const loadGradingStudentViewState = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      submissionCommitSha: "a".repeat(40),
      gradingStatus: "complete",
      viewState: persisted
    });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      loadGradingStudentViewState
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent(JSON.stringify(persisted));
    expect(loadGradingStudentViewState).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(loadGradingStudentViewState.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
  });

  it("loads switched students and ignores a stale prior response", async () => {
    const ada = deferred<ReturnType<typeof source>>();
    const grace = deferred<ReturnType<typeof source>>();
    const loadGradingStudentSource = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada" ? ada.promise : grace.promise
    );
    setApis(vi.fn().mockResolvedValue(workspace()), loadGradingStudentSource);

    render(<GradingWorkspacePage request={REQUEST} />);
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(loadGradingStudentSource).toHaveBeenCalledTimes(2));

    await act(async () => grace.resolve(source("grace")));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:class grace {}");
    await act(async () => ada.resolve(source("ada")));
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:class grace {}");
    expect(screen.getByTestId("mock-monaco")).not.toHaveTextContent("ada:class ada {}");
  });

  it("does not restore a stale prior-student view-state response into the current student", async () => {
    const adaView = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "not_started";
      viewState: GradingEditorViewState;
    }>();
    const graceView = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "not_started";
      viewState: GradingEditorViewState;
    }>();
    const loadView = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada" ? adaView.promise : graceView.promise
    );
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      loadView
    );

    render(<GradingWorkspacePage request={REQUEST} />);
    await waitFor(() => expect(loadView).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" }));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(loadView).toHaveBeenCalledWith({ ...REQUEST, studentId: "grace" }));
    await act(async () =>
      graceView.resolve({
        status: "success",
        studentId: "grace",
        submissionCommitSha: "b".repeat(40),
        gradingStatus: "not_started",
        viewState: {
          scrollTop: 40,
          cursor: { file: "src/Main.java", line: 1, column: 3 }
        }
      })
    );
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent('"scrollTop":40');
    await act(async () =>
      adaView.resolve({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState: {
          scrollTop: 99,
          cursor: { file: "src/Main.java", line: 1, column: 5 }
        }
      })
    );
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:");
    expect(screen.getByTestId("mock-monaco")).not.toHaveTextContent('"scrollTop":99');
  });

  it("debounces rapid changes to one latest canonical save with no extra trust fields", async () => {
    const saveView = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      submissionCommitSha: "a".repeat(40),
      gradingStatus: "not_started",
      viewState: null
    });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    expect(saveView).not.toHaveBeenCalled();
    await act(async () => vi.runAllTimersAsync());

    expect(saveView).toHaveBeenCalledTimes(1);
    expect(saveView).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      viewState: {
        scrollTop: 20,
        cursor: { file: "src/Main.java", line: 1, column: 4 }
      }
    });
    expect(JSON.stringify(saveView.mock.calls[0]?.[0])).not.toMatch(
      /github|repository|commit|sha|status|uri|lineNumber/iu
    );
  });

  it("flushes the prior student's pending snapshot under that identity when switching", async () => {
    const saveView = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      submissionCommitSha: "a".repeat(40),
      gradingStatus: "not_started",
      viewState: null
    });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));

    expect(saveView).toHaveBeenCalledTimes(1);
    expect(saveView.mock.calls[0]?.[0]).toMatchObject({
      studentId: "ada",
      viewState: { scrollTop: 10 }
    });
    await act(async () => vi.runAllTimersAsync());
    expect(saveView).toHaveBeenCalledTimes(1);
  });

  it("restores each student's own saved location across Adams to Brown to Adams navigation", async () => {
    const saved = new Map<string, GradingEditorViewState>();
    const loadView = vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success" as const,
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started" as const,
        viewState: saved.get(studentId) ?? null
      })
    );
    const saveView = vi.fn(
      ({ studentId, viewState }: { studentId: string; viewState: GradingEditorViewState }) => {
        saved.set(studentId, viewState);
        return Promise.resolve({
          status: "success" as const,
          studentId,
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "not_started" as const,
          viewState
        });
      }
    );
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      loadView,
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:");
    fireEvent.click(screen.getByRole("button", { name: "Move grace once" }));
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));

    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("ada:");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent('"scrollTop":20');
    expect(screen.getByTestId("mock-monaco")).not.toHaveTextContent('"scrollTop":10');
    expect(saveView.mock.calls.map(([call]) => call.studentId)).toEqual(["ada", "grace"]);
  });

  it("flushes pending valid state on unmount", async () => {
    const saveView = vi.fn().mockResolvedValue({ status: "success", studentId: "ada" });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView
    );
    const rendered = render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    rendered.unmount();
    expect(saveView).toHaveBeenCalledTimes(1);
    await act(async () => vi.runAllTimersAsync());
    expect(saveView).toHaveBeenCalledTimes(1);
  });

  it("disables restoration and autosave when loading reports submission_changed", async () => {
    const saveView = vi.fn();
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      vi.fn().mockResolvedValue({ status: "submission_changed", studentId: "ada" }),
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The local submission changed after grading state was created"
    );
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("null");
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveView).not.toHaveBeenCalled();
  });

  it("stops later autosaves and warns without reconciling SHA after save submission_changed", async () => {
    const saveView = vi.fn().mockResolvedValue({ status: "submission_changed", studentId: "ada" });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    await act(async () => vi.runAllTimersAsync());
    expect(screen.getByRole("alert")).toHaveTextContent("Existing grading state was not modified");
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    await act(async () => vi.runAllTimersAsync());
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(saveView.mock.calls)).not.toMatch(/submissionCommitSha/iu);
  });

  it("keeps the editor and student navigation usable after an autosave failure", async () => {
    const saveView = vi.fn().mockRejectedValue(new Error("private path and stack"));
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      saveView
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    await act(async () => vi.runAllTimersAsync());

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Editor position could not be saved safely"
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("private path and stack");
    vi.useRealTimers();
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:");
  });

  it("keeps student navigation usable after a safe source-load failure", async () => {
    const loadGradingStudentSource = vi
      .fn()
      .mockResolvedValueOnce({ status: "repository_not_recorded" })
      .mockResolvedValueOnce(source("grace"));
    setApis(vi.fn().mockResolvedValue(workspace()), loadGradingStudentSource);

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(
      await screen.findByText(/Download this student's repository through Graider/u)
    ).toBeInTheDocument();
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:class grace {}");
  });

  it("does not request source for a fail-closed workspace outcome", async () => {
    const loadGradingStudentSource = vi.fn();
    setApis(
      vi.fn().mockResolvedValue({ status: "faculty_identity_required" }),
      loadGradingStudentSource
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(
      await screen.findByText("Configure your local faculty MSOE username before grading.")
    ).toBeInTheDocument();
    expect(loadGradingStudentSource).not.toHaveBeenCalled();
  });

  it("shows a non-error empty state when the assignment has no required files", async () => {
    const emptyWorkspace = { ...workspace(), requiredFiles: [] };
    setApis(
      vi.fn().mockResolvedValue(emptyWorkspace),
      vi.fn().mockResolvedValue({
        status: "success",
        studentId: "ada",
        combinedText: "",
        sections: [],
        syntheticCombinedLines: []
      })
    );

    render(<GradingWorkspacePage request={REQUEST} />);
    expect(await screen.findByText("No required files are configured.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("passes an all-missing source model to the viewer in configured order", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue({
        status: "success",
        studentId: "ada",
        combinedText: "",
        syntheticCombinedLines: [],
        sections: [
          { status: "missing", file: "src/First.java", insertionLine: 1 },
          { status: "missing", file: "src/Second.java", insertionLine: 1 }
        ]
      })
    );

    render(<GradingWorkspacePage request={REQUEST} />);
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent(
      "src/First.java-missing,src/Second.java-missing"
    );
  });
});

describe("GradingWorkspacePage grading snapshot", () => {
  it("loads the selected snapshot with canonical identity and displays the canonical score order", async () => {
    const loadSnapshot = vi.fn().mockResolvedValue({
      ...snapshot("ada"),
      grade: {
        pointsPossible: 100,
        totalScore: 73.25,
        categories: [
          {
            id: "correctness",
            name: "Correctness",
            pointsPossible: 70,
            score: 50.25,
            categorizedCommentAdjustmentTotal: -19.75,
            manualAdjustmentTotal: 0
          },
          {
            id: "quality",
            name: "Code Quality",
            pointsPossible: 30,
            score: 23,
            categorizedCommentAdjustmentTotal: -5,
            manualAdjustmentTotal: -2
          }
        ],
        uncategorizedCommentAdjustmentTotal: 0
      }
    });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText("73.25 / 100")).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" });
    expect(Object.keys(loadSnapshot.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    const categories = screen.getByRole("list", { name: "Rubric categories" });
    expect(categories).toHaveTextContent("Correctness50.25 / 70Code Quality23 / 30");
  });

  it.each([
    ["not_started", "Not Started"],
    ["in_progress", "In Progress"],
    ["complete", "Complete"],
    ["published", "Published"]
  ] as const)("displays the %s status as %s", async (gradingStatus, expected) => {
    setApis(
      vi.fn().mockResolvedValue(workspace([{ studentId: "ada", section: "001", gradingStatus }])),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada", gradingStatus))
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(
      await screen.findByText(expected, { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
  });

  it.each(["not_started", "in_progress"] as const)(
    "offers Mark Complete for %s grading",
    async (gradingStatus) => {
      setApis(
        vi.fn().mockResolvedValue(workspace([{ studentId: "ada", section: "001", gradingStatus }])),
        vi.fn().mockResolvedValue(source("ada")),
        undefined,
        undefined,
        vi.fn().mockResolvedValue(snapshot("ada", gradingStatus))
      );

      render(<GradingWorkspacePage request={REQUEST} />);

      expect(await screen.findByRole("button", { name: "Mark Complete" })).toBeEnabled();
    }
  );

  it.each([
    ["complete", "Complete"],
    ["published", "Published"]
  ] as const)("keeps %s display-only without lifecycle controls", async (gradingStatus, label) => {
    setApis(
      vi.fn().mockResolvedValue(workspace([{ studentId: "ada", section: "001", gradingStatus }])),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada", gradingStatus))
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    await screen.findByText(label, {
      selector: ".grading-student-snapshot strong"
    });
    expect(screen.queryByRole("button", { name: "Mark Complete" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark Published|Set Status|Unpublish/u })
    ).not.toBeInTheDocument();
  });

  it("confirms Mark Complete, sends only the canonical identity, then refreshes the authoritative snapshot", async () => {
    const markComplete = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete"
    });
    const refreshed = {
      ...snapshot("ada", "complete"),
      appliedComments: [{ id: "comment", text: "Snapshot comment", deduction: -5 }],
      grade: {
        ...snapshot("ada").grade,
        totalScore: 95,
        categories: [
          {
            id: "quality",
            name: "Code Quality",
            pointsPossible: 100,
            score: 95,
            categorizedCommentAdjustmentTotal: -5,
            manualAdjustmentTotal: 0
          }
        ]
      }
    };
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot("ada"))
      .mockResolvedValueOnce(refreshed);
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      markComplete
    );

    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Complete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Mark ada grading complete?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel marking complete" }));
    expect(markComplete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mark Complete" }));
    await waitFor(() =>
      expect(markComplete).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" })
    );
    expect(Object.keys(markComplete.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    expect(
      await screen.findByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByText("Snapshot comment")).toBeInTheDocument();
    expect(screen.getByText("95 / 100", { selector: ".grading-score-total" })).toBeInTheDocument();
    await showAllStudents();
    expect(screen.getByRole("button", { name: /ada · Section 001/u })).toHaveTextContent(
      "Complete"
    );
  });

  it("flushes view state before Mark Complete and persists newer view state after it", async () => {
    const firstSave = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "not_started";
      viewState: null;
    }>();
    const saveView = vi
      .fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "complete",
        viewState: null
      });
    const complete = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "complete";
    }>();
    const markComplete = vi.fn().mockReturnValue(complete.promise);
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView,
      vi
        .fn()
        .mockResolvedValueOnce(snapshot("ada", "not_started"))
        .mockResolvedValueOnce(snapshot("ada", "complete")),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      markComplete
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mark Complete" }));
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(1));
    expect(markComplete).not.toHaveBeenCalled();

    await act(async () =>
      firstSave.resolve({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState: null
      })
    );
    await waitFor(() => expect(markComplete).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    await act(async () =>
      complete.resolve({ status: "success", studentId: "ada", gradingStatus: "complete" })
    );
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(2));
    expect(saveView.mock.calls[1]?.[0]).toMatchObject({
      studentId: "ada",
      viewState: { scrollTop: 20 }
    });
  });

  it("retains the authoritative snapshot and blocks later grading mutations after submission_changed", async () => {
    const markComplete = vi
      .fn()
      .mockResolvedValue({ status: "submission_changed", studentId: "ada" });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada", "not_started")),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      markComplete
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mark Complete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("different local submission");
    expect(
      screen.getByText("Not Started", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeDisabled();
  });

  it("keeps a pending Mark Complete bound to its originating student after navigation", async () => {
    const completion = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "complete";
    }>();
    const markComplete = vi.fn().mockReturnValue(completion.promise);
    const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve(snapshot(studentId, studentId === "ada" ? "not_started" : "complete"))
    );
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      markComplete
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Complete" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Mark Complete" }));
    await waitFor(() =>
      expect(markComplete).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada" })
    );
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(
      await screen.findByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();

    await act(async () =>
      completion.resolve({ status: "success", studentId: "ada", gradingStatus: "complete" })
    );
    expect(screen.getByRole("button", { name: /grace · Section 002/u })).toHaveClass("selected");
    expect(screen.queryByRole("button", { name: "Mark Complete" })).not.toBeInTheDocument();
  });

  it("displays a missing-state projection as Not Started with a manual score note", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada"))
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(
      await screen.findByText("Not Started", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByText("No rubric — enter a score manually")).toBeInTheDocument();
    expect(screen.queryByText("100 / 100")).not.toBeInTheDocument();
    expect(screen.getByText("No rubric categories are configured.")).toBeInTheDocument();
    expect(screen.getByText("No comments applied.")).toBeInTheDocument();
    expect(screen.getByText("No manual adjustments.")).toBeInTheDocument();
  });

  it("ignores a stale snapshot response after switching students", async () => {
    const ada = deferred<ReturnType<typeof snapshot>>();
    const grace = deferred<ReturnType<typeof snapshot>>();
    const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada" ? ada.promise : grace.promise
    );
    const loadLibrary = vi.fn().mockResolvedValue({ status: "success", comments: [] });
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      loadSnapshot,
      loadLibrary
    );
    const category = (score: number): ReturnType<typeof snapshot>["grade"]["categories"] =>
      [
        {
          id: "quality",
          name: "Code Quality",
          pointsPossible: 100,
          score,
          categorizedCommentAdjustmentTotal: 0,
          manualAdjustmentTotal: 0
        }
      ] as unknown as ReturnType<typeof snapshot>["grade"]["categories"];
    render(<GradingWorkspacePage request={REQUEST} />);
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledTimes(2));

    await act(async () =>
      grace.resolve({
        ...snapshot("grace"),
        grade: { ...snapshot("grace").grade, totalScore: 82, categories: category(82) }
      })
    );
    expect(
      await screen.findByText("82 / 100", { selector: ".grading-score-total" })
    ).toBeInTheDocument();
    await act(async () =>
      ada.resolve({
        ...snapshot("ada"),
        grade: { ...snapshot("ada").grade, totalScore: 41, categories: category(41) }
      })
    );
    expect(screen.getByText("82 / 100", { selector: ".grading-score-total" })).toBeInTheDocument();
    expect(
      screen.queryByText("41 / 100", { selector: ".grading-score-total" })
    ).not.toBeInTheDocument();
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("shows applied comments, source locations, and manual adjustments", async () => {
    const loaded = {
      ...snapshot("ada", "in_progress"),
      appliedComments: [
        { id: "general", text: "General feedback", deduction: -2 },
        {
          id: "single",
          text: "Single line feedback",
          deduction: -3,
          rubricCategoryId: "quality",
          sourceLocation: { file: "src/Main.java", startLine: 7, endLine: 7 }
        },
        {
          id: "range",
          text: "Range feedback",
          deduction: -4,
          sourceLocation: { file: "src/Other.java", startLine: 2, endLine: 5 }
        }
      ],
      manualAdjustments: [
        { id: "manual", rubricCategoryId: "quality", amount: 1.5, note: "Recovered point" }
      ],
      grade: {
        ...snapshot("ada").grade,
        categories: [
          {
            id: "quality",
            name: "Code Quality",
            pointsPossible: 100,
            score: 100,
            categorizedCommentAdjustmentTotal: 0,
            manualAdjustmentTotal: 0
          }
        ]
      }
    };
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(loaded)
    );

    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText("General feedback")).toBeInTheDocument();
    expect(screen.getByText("Source: src/Main.java, line 7")).toBeInTheDocument();
    expect(screen.getByText("Source: src/Other.java, lines 2–5")).toBeInTheDocument();
    expect(screen.getAllByText("Category: Code Quality")).toHaveLength(2);
    expect(screen.getByText("Adjustment: +1.5")).toBeInTheDocument();
    expect(screen.getByText("Recovered point")).toBeInTheDocument();
  });

  it("isolates snapshot submission mismatch and keeps student navigation usable", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce({ status: "submission_changed", studentId: "ada" })
      .mockResolvedValueOnce(snapshot("grace", "complete"));
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      loadSnapshot
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText(snapshotSubmissionChangedText)).toBeInTheDocument();
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(
      await screen.findByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:");
  });
});

describe("GradingWorkspacePage comment library", () => {
  it("searches title, text, and tags case-insensitively and combines multiple tags with AND", async () => {
    const comments = [
      {
        id: "first",
        title: "Loop Style",
        text: "Prefer a clearer iterator",
        defaultDeduction: -1,
        tags: ["Java", "style"]
      },
      {
        id: "second",
        title: "Test coverage",
        text: "Add edge cases",
        defaultDeduction: -2,
        tags: ["Java", "testing"]
      },
      {
        id: "third",
        title: "Naming",
        text: "Use descriptive identifiers",
        defaultDeduction: -0.5,
        tags: ["style"]
      }
    ];
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      undefined,
      vi.fn().mockResolvedValue({ status: "success", comments })
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    const library = await screen.findByRole("list", { name: "Reusable comments" });
    expect(
      within(library)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("strong")?.textContent)
    ).toEqual(["Loop Style", "Test coverage", "Naming"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search comments" }), {
      target: { value: "EDGE" }
    });
    expect(screen.getByRole("list", { name: "Reusable comments" })).toHaveTextContent(
      "Test coverage"
    );
    expect(screen.queryByText("Loop Style")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search comments" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Java" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "style" }));
    expect(screen.getByRole("list", { name: "Reusable comments" })).toHaveTextContent("Loop Style");
    expect(screen.queryByText("Test coverage")).not.toBeInTheDocument();
    expect(screen.queryByText("Naming")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search comments" }), {
      target: { value: "naming" }
    });
    expect(screen.getByText("No matching reusable comments.")).toBeInTheDocument();
  });

  it("keeps snapshot and source usable when the library fails without exposing raw errors", async () => {
    const loadLibrary = vi.fn().mockRejectedValue(new Error("/private/course/comments.json stack"));
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada")),
      loadLibrary
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText("No rubric — enter a score manually")).toBeInTheDocument();
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("ada:");
    expect(
      screen.getByText("The shared comment library could not be loaded safely.")
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("/private/course/comments.json stack");
  });

  it("does not invoke any grading or comment-library mutation API", async () => {
    const mutations = {
      addGradingStudentComment: vi.fn(),
      editGradingStudentComment: vi.fn(),
      deleteGradingStudentComment: vi.fn(),
      createGradingLibraryComment: vi.fn(),
      editGradingLibraryComment: vi.fn(),
      deleteGradingLibraryComment: vi.fn()
    };
    Object.assign(window.graiderUI, mutations);
    const saveView = vi.fn();
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      saveView,
      undefined,
      vi.fn().mockResolvedValue({
        status: "success",
        comments: [
          { id: "one", title: "One", text: "Feedback", defaultDeduction: -1, tags: ["tag"] }
        ]
      })
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("One");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search comments" }), {
      target: { value: "feedback" }
    });
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await screen.findByText("No rubric — enter a score manually");

    Object.values(mutations).forEach((mutation) => expect(mutation).not.toHaveBeenCalled());
    expect(saveView).not.toHaveBeenCalled();
  });
});

describe("GradingWorkspacePage comment application", () => {
  const reusableComment = {
    id: "library-one",
    title: "Loop clarity",
    text: "Use a clearer loop.",
    defaultDeduction: -2,
    defaultRubricCategoryId: "quality",
    tags: ["style"]
  };
  const rubricWorkspace = () => ({
    ...workspace(),
    rubric: [{ id: "quality", name: "Code Quality", points: 100 }]
  });
  const refreshedSnapshot = (studentId = "ada") => ({
    ...snapshot(studentId, "in_progress"),
    appliedComments: [
      {
        id: "applied-id",
        sourceCommentId: "library-one",
        text: "Customized feedback",
        deduction: -4,
        rubricCategoryId: "quality",
        sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 5 }
      }
    ],
    grade: {
      pointsPossible: 100,
      totalScore: 91.5,
      categories: [
        {
          id: "quality",
          name: "Code Quality",
          pointsPossible: 100,
          score: 91.5,
          categorizedCommentAdjustmentTotal: -8.5,
          manualAdjustmentTotal: 0
        }
      ],
      uncategorizedCommentAdjustmentTotal: 0
    }
  });

  it("enables Add Comment for a selected line and applies a direct anchored comment", async () => {
    const addComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      appliedComments: []
    });
    const directComment = {
      id: "direct-id",
      title: "Branch explanation",
      text: "Explain this branch.",
      deduction: -3,
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    };
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(snapshot("ada"))
        .mockResolvedValueOnce({
          ...snapshot("ada", "in_progress"),
          appliedComments: [directComment]
        }),
      undefined,
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("form", { name: "Add comment" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: directComment.text }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deduction" }), {
      target: { value: "3" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));

    expect(addComment).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: `  ${directComment.title}  ` }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));

    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(addComment.mock.calls[0]?.[0].comment).toMatchObject({
      title: directComment.title,
      text: directComment.text,
      deduction: 3,
      sourceLocation: directComment.sourceLocation
    });
    expect(addComment.mock.calls[0]?.[0].comment).not.toHaveProperty("sourceCommentId");
    expect(await screen.findByText(directComment.text)).toBeInTheDocument();
  });

  it("uses the selected canonical range for a direct comment and clears stale selection on student switch", async () => {
    const addComment = vi.fn();
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      undefined,
      undefined,
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Select ada range" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByText("Source target: src/Main.java: 2-5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:"));
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
    expect(addComment).not.toHaveBeenCalled();
  });

  it("populates reusable defaults, allows overrides, applies a canonical source range, and refreshes the authoritative grade", async () => {
    const addComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      appliedComments: []
    });
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot("ada"))
      .mockResolvedValueOnce(refreshedSnapshot());
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot,
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("Loop clarity");
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Select ada range" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Loop clarity" }));

    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Use a clearer loop.");
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Loop clarity");
    expect(screen.getByRole("spinbutton", { name: "Deduction" })).toHaveValue(2);
    expect(screen.getByRole("combobox", { name: "Comment rubric category" })).toHaveValue(
      "quality"
    );
    expect(screen.getByText("Source target: src/Main.java: 2-5")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Customized feedback" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deduction" }), {
      target: { value: "4" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));

    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(addComment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      comment: {
        id: expect.any(String),
        sourceCommentId: "library-one",
        title: "Loop clarity",
        text: "Customized feedback",
        deduction: 4,
        rubricCategoryId: "quality",
        sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 5 }
      }
    });
    expect(loadSnapshot).toHaveBeenNthCalledWith(2, { ...REQUEST, studentId: "ada" });
    expect(Object.keys(addComment.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "comment",
      "courseFolderId",
      "courseFolderPath",
      "studentId",
      "termCode"
    ]);
    expect(
      await screen.findByText("91.5 / 100", { selector: ".grading-score-total" })
    ).toBeInTheDocument();
    expect(screen.getByText("Customized feedback")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ada · Section 001 · In Progress/u })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent(
      '"sourceLocation":{"file":"src/Main.java","startLine":2,"endLine":5}'
    );
  });

  it("drops an invalid reusable default category and applies a general snapshot without source coordinates", async () => {
    const addComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      appliedComments: []
    });
    const invalidDefault = { ...reusableComment, defaultRubricCategoryId: "old-category" };
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(snapshot("ada"))
        .mockResolvedValueOnce({
          ...snapshot("ada", "in_progress"),
          appliedComments: [
            {
              id: "general-id",
              sourceCommentId: "library-one",
              text: reusableComment.text,
              deduction: -2
            }
          ],
          grade: { ...snapshot("ada").grade, totalScore: 98 }
        }),
      vi.fn().mockResolvedValue({ status: "success", comments: [invalidDefault] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(await screen.findByRole("button", { name: "Apply Loop clarity" }));

    expect(screen.getByRole("combobox", { name: "Comment rubric category" })).toHaveValue("");
    expect(screen.getByRole("radio", { name: "General" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(addComment.mock.calls[0]?.[0].comment).not.toHaveProperty("rubricCategoryId");
    expect(addComment.mock.calls[0]?.[0].comment).not.toHaveProperty("sourceLocation");
    expect(await screen.findByText("No rubric — enter a score manually")).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("[]");
  });

  it("allows faculty to clear a valid default category before applying", async () => {
    const addComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      appliedComments: []
    });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(snapshot("ada"))
        .mockResolvedValueOnce({
          ...snapshot("ada", "in_progress"),
          grade: { ...snapshot("ada").grade, totalScore: 98 }
        }),
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Comment rubric category" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));

    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(addComment.mock.calls[0]?.[0].comment).not.toHaveProperty("rubricCategoryId");
  });

  it("clears a category, prevents invalid-source submission, and cancels without mutation", async () => {
    const addComment = vi.fn();
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      undefined,
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("Loop clarity");
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Comment rubric category" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Select ada invalid" }));
    expect(screen.getByRole("button", { name: "Apply comment" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
    expect(addComment).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: "Apply Loop clarity" })).not.toBeInTheDocument();
  });

  it("prevents duplicate apply while pending and retains the prior score on failure", async () => {
    const mutation = deferred<{ status: "grading_state_error"; studentId: string; code: string }>();
    const addComment = vi.fn(() => mutation.promise);
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      undefined,
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(await screen.findByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Applying…" }));
    expect(addComment).toHaveBeenCalledTimes(1);
    await act(async () =>
      mutation.resolve({ status: "grading_state_error", studentId: "ada", code: "invalid" })
    );
    expect(screen.getByText("No rubric — enter a score manually")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Grading state could not be updated safely"
    );
  });

  it("flushes view state before add and saves changes made during the mutation afterward", async () => {
    const firstSave = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "not_started";
      viewState: GradingEditorViewState;
    }>();
    const add = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "in_progress";
      appliedComments: readonly [];
    }>();
    const saveView = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementation(({ studentId, viewState }) =>
        Promise.resolve({
          status: "success",
          studentId,
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "in_progress",
          viewState
        })
      );
    const addComment = vi.fn(() => add.promise);
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView,
      vi.fn().mockResolvedValue(snapshot("ada", "in_progress")),
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByText("Loop clarity");
    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(1));
    expect(addComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    expect(saveView).toHaveBeenCalledTimes(1);
    await act(async () =>
      firstSave.resolve({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState: {
          scrollTop: 10,
          cursor: { file: "src/Main.java", line: 1, column: 2 }
        }
      })
    );
    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1));
    await act(async () =>
      add.resolve({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        appliedComments: []
      })
    );
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(2));
    expect(saveView.mock.calls[1]?.[0]).toMatchObject({
      studentId: "ada",
      viewState: { scrollTop: 20 }
    });
    expect(saveView.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      addComment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(addComment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      saveView.mock.invocationCallOrder[1] ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("keeps a pending student's refresh from replacing the student selected afterward", async () => {
    const add = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "in_progress";
      appliedComments: readonly [];
    }>();
    const adaRefresh = deferred<ReturnType<typeof snapshot>>();
    const saveView = vi.fn().mockImplementation(({ studentId, viewState }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "in_progress",
        viewState
      })
    );
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot("ada"))
      .mockResolvedValueOnce(snapshot("grace", "complete"))
      .mockImplementationOnce(() => adaRefresh.promise);
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      saveView,
      loadSnapshot,
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      vi.fn(() => add.promise)
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    fireEvent.click(await screen.findByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Applying…" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(
      await screen.findByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    await act(async () =>
      add.resolve({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        appliedComments: []
      })
    );
    await act(async () => adaRefresh.resolve(snapshot("ada", "in_progress")));
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(1));
    expect(saveView.mock.calls[0]?.[0]).toMatchObject({
      studentId: "ada",
      viewState: { scrollTop: 20 }
    });
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:");
  });

  it("blocks further mutation after submission_changed while navigation remains usable", async () => {
    const addComment = vi
      .fn()
      .mockResolvedValue({ status: "submission_changed", studentId: "ada" });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      undefined,
      vi.fn().mockResolvedValue({ status: "success", comments: [reusableComment] }),
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Apply Loop clarity" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("different local submission");
    expect(screen.getByRole("button", { name: "Apply comment" })).toBeDisabled();
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:");
    expect(addComment).toHaveBeenCalledTimes(1);
  });

  it("shows persisted source annotations on initial load and replaces them when switching students", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        ...snapshot("ada", "in_progress"),
        appliedComments: [
          {
            id: "existing",
            text: "Persisted source feedback",
            deduction: -1,
            sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
          },
          { id: "general", text: "General only", deduction: -1 }
        ]
      })
      .mockResolvedValueOnce({
        ...snapshot("grace", "complete"),
        appliedComments: [{ id: "grace-general", text: "Grace general", deduction: -2 }]
      });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      loadSnapshot
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByTestId("mock-annotations")).toHaveTextContent(
      "Persisted source feedback"
    );
    expect(screen.getByTestId("mock-annotations")).not.toHaveTextContent("General only");
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:"));
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("[]");
  });
});

describe("GradingWorkspacePage applied comment editing and deletion", () => {
  const rubricWorkspace = () => ({
    ...workspace(),
    rubric: [
      { id: "quality", name: "Code Quality", points: 60 },
      { id: "correctness", name: "Correctness", points: 40 }
    ]
  });
  const appliedComment = {
    id: "applied-one",
    sourceCommentId: "library-one",
    text: "Original feedback",
    deduction: -5,
    rubricCategoryId: "quality"
  };
  const gradingSnapshot = (
    gradingStatus: "not_started" | "in_progress" | "complete" | "published",
    comments: readonly (typeof appliedComment & {
      readonly sourceLocation?: { file: string; startLine: number; endLine: number };
    })[] = [appliedComment],
    totalScore = 95
  ) => ({
    ...snapshot("ada", gradingStatus),
    appliedComments: comments,
    grade: {
      pointsPossible: 100,
      totalScore,
      categories: [
        {
          id: "quality",
          name: "Code Quality",
          pointsPossible: 60,
          score: totalScore - 40,
          categorizedCommentAdjustmentTotal: totalScore - 100,
          manualAdjustmentTotal: 0
        },
        {
          id: "correctness",
          name: "Correctness",
          pointsPossible: 40,
          score: 40,
          categorizedCommentAdjustmentTotal: 0,
          manualAdjustmentTotal: 0
        }
      ],
      uncategorizedCommentAdjustmentTotal: 0
    }
  });

  it("shows positive magnitude for a legacy positive applied deduction and rejects negative input", async () => {
    const addComment = vi.fn();
    const positiveComment = { ...appliedComment, deduction: 4 };
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(gradingSnapshot("in_progress", [positiveComment])),
      undefined,
      addComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    expect(screen.getByRole("spinbutton", { name: "Deduction" })).toHaveValue(4);
    fireEvent.click(screen.getByRole("button", { name: "Cancel comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
      target: { value: "Penalty" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Too broad." }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deduction" }), {
      target: { value: "-1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Deduction must be zero or greater."
    );
    expect(addComment).not.toHaveBeenCalled();
  });

  it("edits snapshot values without sending provenance and refreshes authoritative score and published status", async () => {
    const refreshedComment = {
      ...appliedComment,
      text: "Revised feedback",
      deduction: -8,
      rubricCategoryId: "correctness"
    };
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(gradingSnapshot("published"))
      .mockResolvedValueOnce(gradingSnapshot("complete", [refreshedComment], 92));
    const editComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete",
      appliedComments: [refreshedComment]
    });
    const saveView = vi.fn().mockImplementation(({ studentId, viewState }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "published",
        viewState
      })
    );
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView,
      loadSnapshot,
      vi.fn().mockResolvedValue({
        status: "success",
        comments: [
          {
            id: "library-one",
            title: "Different defaults",
            text: "Library text must not be loaded",
            defaultDeduction: -99,
            tags: []
          }
        ]
      }),
      undefined,
      editComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    expect(screen.getByRole("textbox", { name: "Comment" })).toHaveValue("Original feedback");
    expect(screen.getByRole("spinbutton", { name: "Deduction" })).toHaveValue(5);
    expect(screen.getByRole("combobox", { name: "Comment rubric category" })).toHaveValue(
      "quality"
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Revised feedback" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Deduction" }), {
      target: { value: "8" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Comment rubric category" }), {
      target: { value: "correctness" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));

    await waitFor(() => expect(editComment).toHaveBeenCalledTimes(1));
    expect(saveView).toHaveBeenCalledTimes(1);
    expect(saveView.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      editComment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(editComment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      commentId: "applied-one",
      replacement: {
        text: "Revised feedback",
        deduction: 8,
        rubricCategoryId: "correctness"
      }
    });
    expect(editComment.mock.calls[0]?.[0].replacement).not.toHaveProperty("sourceCommentId");
    expect(Object.keys(editComment.mock.calls[0]?.[0] as object).sort()).toEqual([
      "assignmentSlug",
      "commentId",
      "courseFolderId",
      "courseFolderPath",
      "replacement",
      "studentId",
      "termCode"
    ]);
    expect(await screen.findByText("Revised feedback")).toBeInTheDocument();
    expect(screen.getByText("92 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
  });

  it("retains an anchored target until Use current selection explicitly replaces it", async () => {
    const anchored = {
      ...appliedComment,
      sourceLocation: { file: "src/Main.java", startLine: 7, endLine: 7 }
    };
    const moved = {
      ...anchored,
      sourceLocation: { file: "src/Main.java", startLine: 2, endLine: 5 }
    };
    const editComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      appliedComments: [moved]
    });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(gradingSnapshot("in_progress", [anchored]))
        .mockResolvedValueOnce(gradingSnapshot("in_progress", [moved])),
      undefined,
      undefined,
      editComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    expect(screen.getByText("Source target: src/Main.java: 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use current selection" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select ada range" }));
    expect(screen.getByText("Source target: src/Main.java: 7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use current selection" }));
    expect(screen.getByText("Source target: src/Main.java: 2-5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));

    await waitFor(() => expect(editComment).toHaveBeenCalledTimes(1));
    expect(editComment.mock.calls[0]?.[0].replacement.sourceLocation).toEqual({
      file: "src/Main.java",
      startLine: 2,
      endLine: 5
    });
    expect(await screen.findByTestId("mock-annotations")).toHaveTextContent('"startLine":2');
    expect(screen.getByTestId("mock-annotations")).not.toHaveTextContent('"startLine":7');
  });

  it("supports Source to General and requires a canonical target for General to Source", async () => {
    const anchored = {
      ...appliedComment,
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    };
    const editComment = vi
      .fn()
      .mockResolvedValueOnce({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        appliedComments: [appliedComment]
      })
      .mockResolvedValueOnce({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        appliedComments: [anchored]
      });
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(gradingSnapshot("in_progress", [anchored]))
      .mockResolvedValueOnce(gradingSnapshot("in_progress", [appliedComment]))
      .mockResolvedValueOnce(gradingSnapshot("in_progress", [anchored]));
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      editComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Comment rubric category" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("radio", { name: "General" }));
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(editComment).toHaveBeenCalledTimes(1));
    expect(editComment.mock.calls[0]?.[0].replacement).not.toHaveProperty("sourceLocation");
    expect(editComment.mock.calls[0]?.[0].replacement).not.toHaveProperty("rubricCategoryId");
    expect(await screen.findByTestId("mock-annotations")).toHaveTextContent("[]");

    fireEvent.click(screen.getByRole("button", { name: "Edit comment: Original feedback" }));
    expect(screen.getByRole("radio", { name: "Source" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select ada line" }));
    fireEvent.click(screen.getByRole("radio", { name: "Source" }));
    expect(screen.getByText("Source target: src/Main.java: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(editComment).toHaveBeenCalledTimes(2));
    expect(editComment.mock.calls[1]?.[0].replacement.sourceLocation).toEqual({
      file: "src/Main.java",
      startLine: 1,
      endLine: 1
    });
    expect(await screen.findByTestId("mock-annotations")).toHaveTextContent("Original feedback");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada:class ada {}");
  });

  it("requires deletion confirmation, honors cancel, and refreshes status and annotations after confirm", async () => {
    const anchored = {
      ...appliedComment,
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    };
    const deleteComment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete",
      appliedComments: []
    });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(gradingSnapshot("published", [anchored]))
        .mockResolvedValueOnce(gradingSnapshot("complete", [], 100)),
      undefined,
      undefined,
      undefined,
      deleteComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Delete comment: Original feedback" })
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Original feedback");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Adjustment: -5");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("src/Main.java, line 1");
    fireEvent.click(screen.getByRole("button", { name: "Cancel deleting comment" }));
    expect(deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting comment" }));

    await waitFor(() => expect(deleteComment).toHaveBeenCalledTimes(1));
    expect(deleteComment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      commentId: "applied-one"
    });
    expect(await screen.findByText("No comments applied.")).toBeInTheDocument();
    expect(screen.getByText("100 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("[]");
  });

  it("keeps the authoritative comment, score, and annotation after edit and delete failures", async () => {
    const anchored = {
      ...appliedComment,
      sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
    };
    const editComment = vi
      .fn()
      .mockResolvedValue({ status: "grading_state_error", studentId: "ada", code: "invalid" });
    const deleteComment = vi.fn().mockResolvedValue({ status: "not_found", studentId: "ada" });
    const loadSnapshot = vi.fn().mockResolvedValue(gradingSnapshot("in_progress", [anchored], 95));
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      editComment,
      deleteComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Local fake" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Grading state could not be updated safely"
    );
    expect(screen.getByText("Original feedback")).toBeInTheDocument();
    expect(screen.queryByText("Local fake", { selector: ".grading-comment-list p" })).toBeNull();
    expect(screen.getByText("95 / 100")).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("Original feedback");

    // The failed edit left the comment editor open with unsaved changes, so
    // opening the delete confirmation must ask before discarding that draft.
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "selected grading record could not be found"
    );
    expect(screen.getByText("Original feedback")).toBeInTheDocument();
    expect(screen.getByText("95 / 100")).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("Original feedback");
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
  });

  it("flushes and defers view-state saves around delete through the shared mutation sequence", async () => {
    const firstSave = deferred<{
      status: "success";
      studentId: string;
      submissionCommitSha: string;
      gradingStatus: "in_progress";
      viewState: GradingEditorViewState;
    }>();
    const deletion = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "in_progress";
      appliedComments: readonly [];
    }>();
    const saveView = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockImplementation(({ studentId, viewState }) =>
        Promise.resolve({
          status: "success",
          studentId,
          submissionCommitSha: "a".repeat(40),
          gradingStatus: "in_progress",
          viewState
        })
      );
    const deleteComment = vi.fn(() => deletion.promise);
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView,
      vi
        .fn()
        .mockResolvedValueOnce(gradingSnapshot("in_progress"))
        .mockResolvedValueOnce(gradingSnapshot("in_progress", [], 100)),
      undefined,
      undefined,
      undefined,
      deleteComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Move ada once" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting comment" }));
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(1));
    expect(deleteComment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Move ada latest" }));
    await act(async () =>
      firstSave.resolve({
        status: "success",
        studentId: "ada",
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "in_progress",
        viewState: { scrollTop: 10, cursor: { file: "src/Main.java", line: 1, column: 2 } }
      })
    );
    await waitFor(() => expect(deleteComment).toHaveBeenCalledTimes(1));
    await act(async () =>
      deletion.resolve({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        appliedComments: []
      })
    );
    await waitFor(() => expect(saveView).toHaveBeenCalledTimes(2));
    expect(saveView.mock.calls[1]?.[0]).toMatchObject({
      studentId: "ada",
      viewState: { scrollTop: 20 }
    });
    expect(saveView.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      deleteComment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(deleteComment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      saveView.mock.invocationCallOrder[1] ?? Number.MAX_SAFE_INTEGER
    );
  });

  it("keeps a pending edit bound to its original student and blocks later mutations on submission change", async () => {
    const edit = deferred<{ status: "submission_changed"; studentId: string }>();
    const editComment = vi.fn((_request: unknown) => edit.promise);
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      vi
        .fn()
        .mockResolvedValueOnce(gradingSnapshot("in_progress"))
        .mockResolvedValueOnce(snapshot("grace", "complete"))
        .mockResolvedValueOnce({ status: "submission_changed", studentId: "ada" }),
      undefined,
      undefined,
      editComment
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit comment: Original feedback" }));
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(editComment).toHaveBeenCalledTimes(1));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByTestId("mock-monaco")).toHaveTextContent("grace:");
    await act(async () => edit.resolve({ status: "submission_changed", studentId: "ada" }));
    expect(editComment.mock.calls[0]?.[0]).toMatchObject({
      studentId: "ada",
      commentId: "applied-one"
    });
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ada · Section 001/u }));
    expect(await screen.findByRole("alert")).toHaveTextContent("different local submission");
    expect(
      screen.queryByRole("button", { name: "Edit comment: Original feedback" })
    ).not.toBeInTheDocument();
    expect(editComment).toHaveBeenCalledTimes(1);
  });
});

describe("GradingWorkspacePage manual adjustments", () => {
  const rubricWorkspace = () => ({
    ...workspace(),
    rubric: [
      { id: "quality", name: "Code Quality", points: 60 },
      { id: "correctness", name: "Correctness", points: 40 }
    ]
  });
  const adjustmentSnapshot = (
    gradingStatus: "not_started" | "in_progress" | "complete" | "published",
    manualAdjustments: readonly {
      id: string;
      rubricCategoryId: string;
      amount: number;
      note?: string;
    }[] = [],
    totalScore = 100
  ) => ({
    ...snapshot("ada", gradingStatus),
    manualAdjustments,
    grade: {
      pointsPossible: 100,
      totalScore,
      categories: [
        {
          id: "quality",
          name: "Code Quality",
          pointsPossible: 60,
          score: 60,
          categorizedCommentAdjustmentTotal: 0,
          manualAdjustmentTotal: 0
        },
        {
          id: "correctness",
          name: "Correctness",
          pointsPossible: 40,
          score: 40,
          categorizedCommentAdjustmentTotal: 0,
          manualAdjustmentTotal: 0
        }
      ],
      uncategorizedCommentAdjustmentTotal: 0
    }
  });

  it("adds a signed decimal adjustment through the narrow API and refreshes the canonical score", async () => {
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(adjustmentSnapshot("not_started"))
      .mockResolvedValueOnce(
        adjustmentSnapshot(
          "in_progress",
          [
            { id: "00000000-0000-4000-8000-000000000000", rubricCategoryId: "quality", amount: 1.5 }
          ],
          101.5
        )
      );
    const addAdjustment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "in_progress",
      manualAdjustments: []
    });
    const saveView = vi.fn().mockImplementation(({ studentId, viewState }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "a".repeat(40),
        gradingStatus: "not_started",
        viewState
      })
    );
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000000"
    );
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      saveView,
      loadSnapshot,
      undefined,
      undefined,
      undefined,
      undefined,
      addAdjustment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    await screen.findByTestId("mock-monaco");
    fireEvent.click(screen.getByRole("button", { name: "Move ada once" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Adjustment rubric category" }), {
      target: { value: "quality" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "1.5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new adjustment" }));

    await waitFor(() => expect(addAdjustment).toHaveBeenCalledTimes(1));
    expect(saveView.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      addAdjustment.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(addAdjustment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      adjustment: {
        id: "00000000-0000-4000-8000-000000000000",
        rubricCategoryId: "quality",
        amount: 1.5
      }
    });
    expect(await screen.findByText("101.5 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("In Progress", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
  });

  it("edits and deletes persisted adjustments without locally changing the score", async () => {
    const original = { id: "adjustment-id", rubricCategoryId: "quality", amount: -2, note: "Late" };
    const edited = { id: "adjustment-id", rubricCategoryId: "correctness", amount: 3.25 };
    const loadSnapshot = vi
      .fn()
      .mockResolvedValueOnce(adjustmentSnapshot("published", [original], 98))
      .mockResolvedValueOnce(adjustmentSnapshot("complete", [edited], 103.25))
      .mockResolvedValueOnce(adjustmentSnapshot("complete", [], 100));
    const editAdjustment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete",
      manualAdjustments: [edited]
    });
    const deleteAdjustment = vi.fn().mockResolvedValue({
      status: "success",
      studentId: "ada",
      gradingStatus: "complete",
      manualAdjustments: []
    });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      editAdjustment,
      deleteAdjustment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit adjustment: quality" }));
    expect(screen.getByRole("combobox", { name: "Adjustment rubric category" })).toHaveValue(
      "quality"
    );
    expect(screen.getByRole("spinbutton", { name: "Amount" })).toHaveValue(-2);
    expect(screen.getByRole("textbox", { name: "Note (optional)" })).toHaveValue("Late");
    fireEvent.change(screen.getByRole("combobox", { name: "Adjustment rubric category" }), {
      target: { value: "correctness" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "3.25" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Note (optional)" }), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));

    await waitFor(() => expect(editAdjustment).toHaveBeenCalledTimes(1));
    expect(editAdjustment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      adjustmentId: "adjustment-id",
      replacement: { rubricCategoryId: "correctness", amount: 3.25 }
    });
    expect(await screen.findByText("103.25 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish this student's report" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Delete adjustment: correctness" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Correctness");
    fireEvent.click(screen.getByRole("button", { name: "Cancel deleting adjustment" }));
    expect(deleteAdjustment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete adjustment: correctness" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting adjustment" }));
    await waitFor(() => expect(deleteAdjustment).toHaveBeenCalledTimes(1));
    expect(deleteAdjustment).toHaveBeenCalledWith({
      ...REQUEST,
      studentId: "ada",
      adjustmentId: "adjustment-id"
    });
    expect(await screen.findByText("100 / 100")).toBeInTheDocument();
    expect(
      screen.getByText("Complete", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
  });

  it("disables adjustment creation when the assignment has no rubric", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(snapshot("ada"))
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByRole("button", { name: "Add adjustment" })).toBeDisabled();
    expect(screen.getByText("Manual adjustments require a rubric category.")).toBeInTheDocument();
  });

  it("validates the canonical category and finite signed amount without changing Monaco", async () => {
    const loaded = adjustmentSnapshot(
      "in_progress",
      [{ id: "negative", rubricCategoryId: "quality", amount: -0.25 }],
      99.75
    );
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue({
        ...loaded,
        appliedComments: [
          {
            id: "anchored-comment",
            text: "Keep this annotation",
            deduction: -1,
            sourceLocation: { file: "src/Main.java", startLine: 1, endLine: 1 }
          }
        ]
      })
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText("Adjustment: -0.25")).toBeInTheDocument();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("Keep this annotation");
    fireEvent.click(screen.getByRole("button", { name: "Add adjustment" }));
    const save = screen.getByRole("button", { name: "Save new adjustment" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox", { name: "Adjustment rubric category" }), {
      target: { value: "quality" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "Infinity" }
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "-2.75" }
    });
    expect(save).toBeEnabled();
    expect(screen.getByTestId("mock-annotations")).toHaveTextContent("Keep this annotation");
  });

  it("retains the authoritative adjustment and blocks later mutations after failure or submission change", async () => {
    const original = { id: "adjustment-id", rubricCategoryId: "quality", amount: -2, note: "Late" };
    const editAdjustment = vi
      .fn()
      .mockResolvedValue({ status: "grading_state_error", studentId: "ada", code: "invalid" });
    const deleteAdjustment = vi
      .fn()
      .mockResolvedValue({ status: "submission_changed", studentId: "ada" });
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn().mockResolvedValue(source("ada")),
      undefined,
      undefined,
      vi.fn().mockResolvedValue(adjustmentSnapshot("published", [original], 98)),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      editAdjustment,
      deleteAdjustment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit adjustment: quality" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "5" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    await waitFor(() => expect(editAdjustment).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Adjustment: -2")).toBeInTheDocument();
    expect(screen.getByText("98 / 100")).toBeInTheDocument();
    expect(screen.getByText("Late")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("could not be updated safely");

    // The failed edit left the adjustment editor open with unsaved changes, so
    // opening the delete confirmation must ask before discarding that draft.
    fireEvent.click(screen.getByRole("button", { name: "Delete adjustment: quality" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard adjustment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting adjustment" }));
    await waitFor(() => expect(deleteAdjustment).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Adjustment: -2")).toBeInTheDocument();
    expect(screen.getByText("98 / 100")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("different local submission");
    expect(screen.getByRole("button", { name: "Add adjustment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit adjustment: quality" })).toBeDisabled();
  });

  it("keeps an adjustment mutation bound to its originating student after navigation", async () => {
    const add = deferred<{
      status: "success";
      studentId: string;
      gradingStatus: "in_progress";
      manualAdjustments: readonly [];
    }>();
    const addAdjustment = vi.fn().mockReturnValue(add.promise);
    const loadSnapshot = vi
      .fn()
      .mockImplementation(({ studentId }: { studentId: string }) =>
        Promise.resolve(
          studentId === "ada"
            ? adjustmentSnapshot("not_started")
            : { ...adjustmentSnapshot("complete", [], 80), studentId: "grace" }
        )
      );
    setApis(
      vi.fn().mockResolvedValue(rubricWorkspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      loadSnapshot,
      undefined,
      undefined,
      undefined,
      undefined,
      addAdjustment
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add adjustment" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Adjustment rubric category" }), {
      target: { value: "quality" }
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), {
      target: { value: "1" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save new adjustment" }));
    await waitFor(() => expect(addAdjustment).toHaveBeenCalledTimes(1));
    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(await screen.findByText("80 / 100")).toBeInTheDocument();
    await act(async () =>
      add.resolve({
        status: "success",
        studentId: "ada",
        gradingStatus: "in_progress",
        manualAdjustments: []
      })
    );
    expect(addAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "ada", adjustment: expect.any(Object) })
    );
    expect(screen.getByText("80 / 100")).toBeInTheDocument();
    expect(screen.queryByText("100 / 100")).not.toBeInTheDocument();
  });
});

describe("GradingWorkspacePage grading progress and filters", () => {
  it("derives header progress and filter pill counts from the same source as the student list", async () => {
    setApis(
      vi.fn().mockResolvedValue(
        workspace([
          { studentId: "ada", section: "001", gradingStatus: "not_started" },
          { studentId: "grace", section: "002", gradingStatus: "complete" },
          { studentId: "henry", section: "003", gradingStatus: "published" },
          { studentId: "ida", section: "004", gradingStatus: "in_progress" }
        ])
      ),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByText("2 of 4 graded · 1 published")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To grade 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graded 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Published 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All 4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ada · Section 001/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ida · Section 004/u })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /grace · Section 002/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /henry · Section 003/u })).not.toBeInTheDocument();
  });

  it("changes only which students are listed when a filter pill is selected", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada:");

    fireEvent.click(await screen.findByRole("button", { name: "Graded 1" }));
    expect(screen.queryByRole("button", { name: /ada · Section 001/u })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /grace · Section 002/u })).toBeInTheDocument();
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada:");
  });

  it("has no students listed for a filter with a zero count and explains why", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    fireEvent.click(await screen.findByRole("button", { name: "Published 0" }));
    expect(screen.getByText("No reports have been published yet.")).toBeInTheDocument();
  });

  it("moves to the next visible student and wraps in the active filter", async () => {
    setApis(
      vi.fn().mockResolvedValue(
        workspace([
          { studentId: "ada", section: "001", gradingStatus: "not_started" },
          { studentId: "grace", section: "002", gradingStatus: "complete" },
          { studentId: "henry", section: "003", gradingStatus: "complete" }
        ])
      ),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");
    expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada:");

    await showAllStudents();
    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:"));

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("henry:"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("ada:"));
  });

  it("disables filter-relative navigation when the active filter is empty", async () => {
    setApis(
      vi.fn().mockResolvedValue(
        workspace([
          { studentId: "ada", section: "001", gradingStatus: "complete" },
          { studentId: "grace", section: "002", gradingStatus: "published" }
        ])
      ),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);

    expect(await screen.findByRole("button", { name: "Next ungraded" })).toBeDisabled();
    expect(screen.getByText("No other visible students.")).toBeInTheDocument();
  });

  it("wraps Previous within the active filter", async () => {
    setApis(
      vi.fn().mockResolvedValue(
        workspace([
          { studentId: "ada", section: "001", gradingStatus: "not_started" },
          { studentId: "grace", section: "002", gradingStatus: "in_progress" }
        ])
      ),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByTestId("mock-monaco")).toHaveTextContent("grace:"));
  });

  it("gives navigation secondary weight so it never competes with Mark Complete or the header publish action", async () => {
    setApis(
      vi.fn().mockResolvedValue(workspace()),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId)))
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    expect(screen.getByRole("button", { name: "Previous" })).toHaveClass("secondary-action");
    expect(screen.getByRole("button", { name: "Previous" })).not.toHaveClass("primary-action");
    expect(screen.getByRole("button", { name: "Next ungraded" })).toHaveClass("secondary-action");
    expect(screen.getByRole("button", { name: "Next ungraded" })).not.toHaveClass("primary-action");

    const markComplete = screen.getByRole("button", { name: "Mark Complete" });
    expect(markComplete).toHaveClass("primary-action");
    expect(markComplete).not.toHaveClass("secondary-action");

    const headerPublish = screen.getByRole("button", { name: /^Publish \d+ reports?$/u });
    expect(headerPublish).toHaveClass("primary-action");
    expect(headerPublish).not.toHaveClass("secondary-action");
  });

  it("keeps the student list and grading pane in agreement about status after a fresh snapshot load", async () => {
    setApis(
      vi.fn().mockResolvedValue(
        workspace([
          { studentId: "ada", section: "001", gradingStatus: "not_started" },
          { studentId: "grace", section: "002", gradingStatus: "not_started" }
        ])
      ),
      vi.fn(({ studentId }: { studentId: string }) => Promise.resolve(source(studentId))),
      undefined,
      undefined,
      vi.fn(({ studentId }: { studentId: string }) =>
        Promise.resolve(snapshot(studentId, studentId === "grace" ? "published" : "not_started"))
      )
    );
    render(<GradingWorkspacePage request={REQUEST} />);
    await screen.findByTestId("mock-monaco");

    fireEvent.click(screen.getByRole("button", { name: /grace · Section 002/u }));
    expect(
      await screen.findByText("Published", { selector: ".grading-student-snapshot strong" })
    ).toBeInTheDocument();
    await showAllStudents();
    expect(screen.getByRole("button", { name: /grace · Section 002/u })).toHaveTextContent(
      "Published"
    );
    expect(screen.getByRole("button", { name: /grace · Section 002/u })).not.toHaveTextContent(
      "Not Started"
    );
  });
});

const snapshotSubmissionChangedText =
  "The local submission changed after grading state was created. Existing grading state belongs to a different local submission and is not being applied.";
