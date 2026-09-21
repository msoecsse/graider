import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GradingWorkspacePrepareRequest } from "../../electron/ipc";

vi.mock("./MonacoSourceViewer", () => ({
  MonacoSourceViewer: ({ studentId }: { studentId: string }) => <div>Source for {studentId}</div>
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
  { studentId: "grace", section: "002", gradingStatus: "not_started" }
];
const operationResult = (
  studentId: string,
  workflowStatus: "replaced_unmanaged" | "already_current" = "replaced_unmanaged",
  dispatchStatus: "dispatched" | "failed" = "dispatched"
) => ({
  status: "success" as const,
  studentId,
  result: {
    repository: {
      owner: "trusted-org",
      name: `lab1-${studentId}`,
      fullName: `trusted-org/lab1-${studentId}`,
      defaultBranch: "main"
    },
    workflow: { status: workflowStatus },
    dispatch: { status: dispatchStatus },
    diagnostics: []
  }
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const setApis = (repair: ReturnType<typeof vi.fn>) => {
  Object.assign(window.graiderUI, {
    prepareGradingWorkspace: vi.fn().mockResolvedValue({
      status: "success",
      assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
      requiredFiles: [],
      rubric: [],
      students
    }),
    loadGradingStudentSource: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        combinedText: "",
        syntheticCombinedLines: [],
        sections: []
      })
    ),
    loadGradingStudentViewState: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        submissionCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        gradingStatus: "not_started",
        viewState: null
      })
    ),
    loadGradingStudentSnapshot: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "success",
        studentId,
        gradingStatus: "not_started",
        appliedComments: [],
        manualAdjustments: [],
        grade: {
          pointsPossible: 0,
          totalScore: 0,
          categories: [],
          uncategorizedCommentAdjustmentTotal: 0
        }
      })
    ),
    loadGradingStudentEvidence: vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({ status: "not_applicable", studentId })
    ),
    repairGradingStudentWorkflow: repair
  });
};

describe("GradingWorkspacePage workflow repair", () => {
  it("requires confirmation for bulk repair and renders its result summary", async () => {
    const repair = vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({
        status: "ready" as const,
        studentId,
        repositoryFullName: "trusted-org/lab1-ada"
      })
    );
    const bulkRepair = vi.fn().mockResolvedValue({
      status: "success",
      studentIds: ["ada", "grace"],
      repositoryResults: [
        {
          studentIds: ["ada"],
          repository: "trusted-org/lab1-ada",
          status: "success",
          workflowStatus: "replaced_managed",
          dispatchStatus: "dispatched"
        },
        {
          studentIds: ["grace"],
          repository: "trusted-org/lab1-grace",
          status: "failed",
          message: "write_failed"
        }
      ],
      counts: {
        total: 2,
        succeeded: 1,
        failed: 1,
        createdOrReplaced: 1,
        alreadyCurrent: 0,
        dispatched: 1,
        dispatchFailed: 0
      }
    });
    setApis(repair);
    Object.assign(window.graiderUI, { repairGradingAssignmentWorkflows: bulkRepair });
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Replace workflows & run for all students" })
    );
    expect(bulkRepair).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Replace workflows and start grading runs?"
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "I understand this replaces repository grading workflows."
      })
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Confirm replace workflows & run for all students"
      })
    );
    await waitFor(() => expect(bulkRepair).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/1 succeeded · 1 failed/u)).toBeInTheDocument();
    expect(screen.getByText(/trusted-org\/lab1-grace: write_failed/u)).toBeInTheDocument();
  });

  it("keeps the action disabled when managed workflow grading is ineligible", async () => {
    const repair = vi.fn(({ studentId }: { studentId: string }) =>
      Promise.resolve({ status: "grading_not_eligible" as const, studentId })
    );
    setApis(repair);
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    expect(
      await screen.findByText(/unavailable for this assignment's grading configuration/u)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace workflow & run" })).toBeDisabled();
  });

  it("requires confirmation and cancel performs no confirmed request", async () => {
    const repair = vi.fn(({ studentId, confirmed }: { studentId: string; confirmed: boolean }) =>
      Promise.resolve(
        confirmed
          ? operationResult(studentId)
          : { status: "ready", studentId, repositoryFullName: `trusted-org/lab1-${studentId}` }
      )
    );
    setApis(repair);
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const action = await screen.findByRole("button", { name: "Replace workflow & run" });
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    const dialog = screen.getByRole("dialog", { name: "Replace workflow and start grading run?" });
    expect(dialog).toHaveTextContent("Replace .github/workflows/grade.yml in trusted-org/lab1-ada");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledWith({ ...REQUEST, studentId: "ada", confirmed: false });
  });

  it("confirms exactly once, disables duplicate submission, and reports dispatch success", async () => {
    const pending = deferred<ReturnType<typeof operationResult>>();
    const repair = vi.fn(({ studentId, confirmed }: { studentId: string; confirmed: boolean }) =>
      confirmed
        ? pending.promise
        : Promise.resolve({
            status: "ready" as const,
            studentId,
            repositoryFullName: `trusted-org/lab1-${studentId}`
          })
    );
    setApis(repair);
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const action = await screen.findByRole("button", { name: "Replace workflow & run" });
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm replace workflow & run" }));
    expect(await within(dialog).findByRole("button", { name: "Confirming…" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirming…" }));
    expect(repair).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenLastCalledWith({ ...REQUEST, studentId: "ada", confirmed: true });

    await act(async () => pending.resolve(operationResult("ada")));
    expect(await screen.findByText(/Grading run dispatched successfully/u)).toHaveTextContent(
      "Unmanaged workflow replaced"
    );
  });

  it("distinguishes a successful repair from a failed dispatch", async () => {
    const repair = vi.fn(({ studentId, confirmed }: { studentId: string; confirmed: boolean }) =>
      Promise.resolve(
        confirmed
          ? operationResult(studentId, "already_current", "failed")
          : { status: "ready", studentId, repositoryFullName: `trusted-org/lab1-${studentId}` }
      )
    );
    setApis(repair);
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    const action = await screen.findByRole("button", { name: "Replace workflow & run" });
    await waitFor(() => expect(action).toBeEnabled());
    fireEvent.click(action);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm replace workflow & run" }));
    expect(
      await screen.findByText(
        /Workflow repair succeeded, but the grading run could not be started/u
      )
    ).toHaveTextContent("already current");
  });

  it("ignores a stale availability result after switching students", async () => {
    const ada = deferred<{ status: "ready"; studentId: string; repositoryFullName: string }>();
    const repair = vi.fn(({ studentId }: { studentId: string }) =>
      studentId === "ada"
        ? ada.promise
        : Promise.resolve({
            status: "ready" as const,
            studentId,
            repositoryFullName: "trusted-org/lab1-grace"
          })
    );
    setApis(repair);
    render(<GradingWorkspacePage request={REQUEST} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: /grace · Section 002/u }));
    await waitFor(() => expect(repair).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Replace workflow & run" })).toBeEnabled();
    await act(async () =>
      ada.resolve({
        status: "ready",
        studentId: "ada",
        repositoryFullName: "trusted-org/lab1-ada"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Replace workflow & run" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("trusted-org/lab1-grace");
  });
});
