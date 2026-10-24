import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { rememberStudentSort } from "./studentSort";
import type { GradingBulkReportPublicationProgressEvent } from "../../electron/ipc";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => rememberStudentSort({ key: "default", direction: "ascending" }));

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
    expect(bulkPublish).toHaveBeenCalledWith({
      ...REQUEST,
      studentIds: ["ada"],
      runId: expect.any(String)
    });
    expect(Object.keys(bulkPublish.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "assignmentSlug",
      "courseFolderId",
      "courseFolderPath",
      "runId",
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

it.each(["success", "mixed", "failure"])(
  "keeps %s publication results until Close and closes without republishing",
  async (outcome) => {
    const pending = deferred<unknown>();
    const bulkPublish = vi.fn().mockReturnValue(pending.promise);
    configure({ statuses: { ada: "complete", grace: "complete" }, bulkPublish });
    render(<GradingWorkspacePage request={REQUEST} />);
    await openPublishReview();
    fireEvent.click(screen.getByRole("button", { name: "Publish 2 reports" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await act(async () =>
      pending.resolve({
        status: "success",
        results: ["ada", "grace"].map((studentId, index) => ({
          studentId,
          result:
            outcome === "success" || (outcome === "mixed" && index === 0)
              ? {
                  status: "success",
                  studentId,
                  reportPath: "feedback.html",
                  warnings: []
                }
              : { status: "report_generation_failed", studentId }
        }))
      })
    );
    const close = await screen.findByRole("button", { name: "Close" });
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publish review" })).toBeInTheDocument();
    expect(document.querySelectorAll(".grading-publish-review__outcome")).toHaveLength(2);
    fireEvent.click(close);
    expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
    expect(bulkPublish).toHaveBeenCalledTimes(1);
  }
);

it("reloads abandoned Graded summary reads when returning, without changing grading or publishing", async () => {
  const pending = deferred<ReturnType<typeof snapshot>>();
  let graceLoads = 0;
  const loadSnapshot = vi.fn(({ studentId }: { studentId: string }) => {
    if (studentId === "grace") {
      graceLoads += 1;
      return graceLoads === 1 ? pending.promise : Promise.resolve(snapshot(studentId, "complete"));
    }
    return Promise.resolve(snapshot(studentId, "not_started"));
  });
  const { bulkPublish } = configure({
    statuses: { ada: "not_started", grace: "complete" },
    loadSnapshot
  });
  render(<GradingWorkspacePage request={REQUEST} />);
  fireEvent.click(await screen.findByRole("button", { name: "Graded 1" }));
  await screen.findByText("Loading…");
  fireEvent.click(screen.getByRole("button", { name: "All 2" }));
  await act(async () => pending.resolve(snapshot("grace", "complete")));
  fireEvent.click(screen.getByRole("button", { name: "Graded 1" }));
  await screen.findByText("No comments or adjustments yet");
  expect(graceLoads).toBe(2);
  expect(bulkPublish).not.toHaveBeenCalled();
});

const sortedRoster = [
  { studentId: "jones", section: "003", firstName: "Amy", lastName: "Jones" },
  { studentId: "adams", section: "002", firstName: "Zoe", lastName: "Adams" },
  { studentId: "smith", section: "001", firstName: "Bob", lastName: "Smith" },
  { studentId: "brown", section: "004", firstName: "May", lastName: "Brown" }
];
const readyOrder = () =>
  [...document.querySelectorAll(".grading-publish-review__table tbody th")].map(
    (row) => row.textContent
  );
const publishedOrder = () =>
  [...document.querySelectorAll(".grading-publish-review__published-row")].map(
    (row) => row.textContent?.match(/jones|adams|smith|brown/u)?.[0]
  );

it.each([
  ["section", "ascending", ["smith", "adams", "jones", "brown"]],
  ["section", "descending", ["brown", "jones", "adams", "smith"]],
  ["firstName", "ascending", ["jones", "smith", "brown", "adams"]],
  ["firstName", "descending", ["adams", "brown", "smith", "jones"]],
  ["lastName", "ascending", ["adams", "brown", "jones", "smith"]],
  ["lastName", "descending", ["smith", "jones", "brown", "adams"]]
] as const)(
  "preserves rendered %s %s grading order in Ready, selection, request and partial Published results",
  async (key, direction, expected) => {
    let published = false;
    const bulkPublish = vi.fn(async () => {
      published = true;
      return {
        status: "success",
        results: expected.map((studentId) => ({
          studentId,
          result: {
            status: studentId === "smith" ? "report_publish_failed" : "success",
            studentId,
            warnings: []
          }
        }))
      };
    });
    configure({
      statuses: Object.fromEntries(sortedRoster.map(({ studentId }) => [studentId, "complete"])),
      bulkPublish,
      loadSnapshot: vi.fn(({ studentId }) =>
        Promise.resolve(
          snapshot(studentId, published && studentId !== "smith" ? "published" : "complete")
        )
      )
    });
    Object.assign(window.graiderUI, {
      prepareGradingWorkspace: vi.fn().mockResolvedValue({
        status: "success",
        assignment: { title: "Lab 1", termCode: "27s1", slug: "lab1" },
        requiredFiles: [],
        rubric: [],
        students: sortedRoster.map((student) => ({ ...student, gradingStatus: "complete" }))
      })
    });
    render(<GradingWorkspacePage request={REQUEST} />);
    const sort = await screen.findByRole("combobox", { name: "Sort by" });
    fireEvent.change(sort, { target: { value: key } });
    if (direction === "descending")
      fireEvent.click(screen.getByRole("button", { name: "Sort descending" }));
    fireEvent.click(screen.getByRole("button", { name: "All 4" }));
    expect(
      [...document.querySelectorAll(".grading-workspace__student-row")].map(
        (row) => row.textContent?.split(" · ")[0]
      )
    ).toEqual(expected);
    await openPublishReview();
    expect(readyOrder()).toEqual(expected);
    expect(
      screen.getAllByRole("checkbox").every((input) => (input as HTMLInputElement).checked)
    ).toBe(true);
    const first = screen.getByRole("checkbox", { name: `Select ${expected[0]} to publish` });
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(screen.getByRole("button", { name: "Publish 4 reports" }));
    await screen.findByRole("button", { name: "Close" });
    expect(bulkPublish).toHaveBeenCalledWith({
      ...REQUEST,
      studentIds: expected,
      runId: expect.any(String)
    });
    expect(publishedOrder()).toEqual(expected.filter((studentId) => studentId !== "smith"));
    expect(readyOrder()).toEqual(["smith"]);
  }
);

it("renders real incremental progress, rejects stale/wrong-scope events, and cleans listeners between runs", async () => {
  const pending = deferred<unknown>();
  const bulkPublish = vi.fn().mockReturnValue(pending.promise);
  configure({ statuses: { ada: "complete", grace: "complete" }, bulkPublish });
  const listeners = new Set<(event: GradingBulkReportPublicationProgressEvent) => void>();
  const unsubscribe = vi.fn();
  Object.assign(window.graiderUI, {
    onGradingBulkReportPublicationProgress: vi.fn((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    })
  });
  const view = render(<GradingWorkspacePage request={REQUEST} />);
  await openPublishReview();
  expect(
    screen.queryByRole("progressbar", { name: "Report publication progress" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await openPublishReview();
  fireEvent.click(screen.getByRole("button", { name: "Publish 2 reports" }));
  expect(screen.getByRole("progressbar", { name: "Report publication progress" })).toHaveAttribute(
    "value",
    "0"
  );
  await waitFor(() => expect(bulkPublish).toHaveBeenCalledTimes(1));
  const runId = bulkPublish.mock.calls[0]?.[0].runId;
  const oldListener = [...listeners][0]!;
  const emit = (progress: GradingBulkReportPublicationProgressEvent["progress"], extra = {}) =>
    act(() => oldListener({ ...REQUEST, runId, progress, ...extra }));
  emit({ total: 2, completed: 2 }, { runId: "old-run" });
  emit({ total: 2, completed: 2 }, { assignmentSlug: "other" });
  emit({ total: 2, completed: 2 }, { courseFolderId: "other-workspace" });
  emit({ total: 2, completed: 2 }, { termCode: "other-term" });
  expect(screen.getByText("0 of 2 complete")).toBeInTheDocument();
  emit({ total: 2, completed: 0, currentStudentId: "ada" });
  expect(screen.getByText("Publishing ada…")).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Select ada to publish" }).closest("tr")
  ).toHaveTextContent("Publishing…");
  emit({
    total: 2,
    completed: 1,
    lastCompleted: { studentId: "ada", result: { status: "report_publish_failed", warnings: [] } }
  });
  expect(screen.getByText("1 of 2 complete")).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Select ada to publish" }).closest("tr")
  ).toHaveTextContent("Failed:");
  emit({ total: 2, completed: 1, currentStudentId: "grace" });
  expect(screen.getByText("Publishing grace…")).toBeInTheDocument();
  emit({
    total: 2,
    completed: 2,
    lastCompleted: { studentId: "grace", result: { status: "success", warnings: [] } }
  });
  expect(
    screen.getByRole("checkbox", { name: "Select grace to publish" }).closest("tr")
  ).toHaveTextContent("Published");
  await act(async () => pending.resolve({ status: "success", results: [] }));
  expect(screen.getByText("2 of 2 processed")).toBeInTheDocument();
  expect(listeners.size).toBe(0);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await openPublishReview();
  expect(
    screen.queryByRole("progressbar", { name: "Report publication progress" })
  ).not.toBeInTheDocument();
  const next = deferred<unknown>();
  bulkPublish.mockReturnValue(next.promise);
  fireEvent.click(screen.getByRole("button", { name: "Publish 2 reports" }));
  expect(listeners.size).toBe(1);
  emit({ total: 2, completed: 2 });
  expect(screen.getByText("0 of 2 complete")).toBeInTheDocument();
  view.rerender(
    <GradingWorkspacePage request={{ ...REQUEST, assignmentSlug: "other-assignment" }} />
  );
  expect(listeners.size).toBe(0);
  emit({ total: 2, completed: 2 });
  expect(screen.queryByRole("heading", { name: "Publish review" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("progressbar", { name: "Report publication progress" })
  ).not.toBeInTheDocument();
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  await act(async () => next.resolve({ status: "success", results: [] }));
});
