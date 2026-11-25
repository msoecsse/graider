import path from "node:path";
import { resolveCurrentFacultyScope } from "./facultyScopeService.js";
import type { GradingStudentSourceRequest } from "./gradingStudentSourceService.js";
import type { GradingStudentRepositoryUpdateResult } from "./gradingStudentRepositoryUpdateService.js";

export type AssignmentRepositoryUpdateRequest = Omit<GradingStudentSourceRequest, "studentId">;
export interface AssignmentRepositoryUpdateRow {
  readonly studentId: string;
  readonly outcome: "updated" | "unchanged" | "failure" | "not_downloaded";
  readonly status: string;
  readonly message: string;
}
export interface AssignmentRepositoryUpdateResult {
  readonly status: string;
  readonly message?: string;
  readonly results: readonly AssignmentRepositoryUpdateRow[];
  readonly counts: {
    readonly total: number;
    readonly updated: number;
    readonly unchanged: number;
    readonly failure: number;
    readonly notDownloaded: number;
  };
}
export interface AssignmentRepositoryUpdateProgress {
  readonly courseFolderId: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly completed: number;
  readonly total: number;
  readonly studentId?: string;
}

const activeAssignments = new Set<string>();
const emptyCounts = () => ({ total: 0, updated: 0, unchanged: 0, failure: 0, notDownloaded: 0 });
const failureMessage =
  "Unable to update safely. Check faculty access, GitHub sign-in, the recorded local folder, upstream branch and local changes, then retry.";
const describeResult = (
  studentId: string,
  result: GradingStudentRepositoryUpdateResult
): AssignmentRepositoryUpdateRow => {
  const outcome =
    result.status === "success"
      ? "updated"
      : result.status === "unchanged"
        ? "unchanged"
        : result.status === "repository_not_recorded"
          ? "not_downloaded"
          : "failure";
  const messages = {
    updated: "Updated; saved grading work was preserved.",
    unchanged: "Already up to date; grading status was preserved.",
    not_downloaded:
      "Not downloaded. Use Download student repositories to clone missing repositories.",
    failure: failureMessage
  };
  return {
    studentId,
    outcome,
    status: result.status,
    message: result.message ?? messages[outcome]
  };
};

/** A main-owned roster, never renderer-selected students or repository paths.
 * The existing backend couples Git safety checks with per-member SHA adoption.
 * Shared clones deliberately use separate member calls (and may fetch again),
 * rather than reuse one member's success as evidence for another member's state.
 */
export const createAssignmentRepositoryUpdateService =
  (dependencies: {
    readonly resolveFacultyScope?: typeof resolveCurrentFacultyScope;
    readonly updateStudent: (
      request: GradingStudentSourceRequest
    ) => Promise<GradingStudentRepositoryUpdateResult>;
  }) =>
  async (
    request: AssignmentRepositoryUpdateRequest,
    onProgress?: (progress: AssignmentRepositoryUpdateProgress) => void
  ): Promise<AssignmentRepositoryUpdateResult> => {
    const key = JSON.stringify([
      path.resolve(request.courseFolderPath),
      request.termCode,
      request.assignmentSlug
    ]);
    if (activeAssignments.has(key))
      return {
        status: "already_running",
        message: "A pull is already running for this assignment. Wait for it to finish.",
        results: [],
        counts: emptyCounts()
      };
    activeAssignments.add(key);
    try {
      const scope = (dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope)(request);
      if (scope.status !== "success")
        return {
          status: scope.status,
          message:
            "Faculty scope is unavailable. Check your faculty identity and assigned sections, then retry.",
          results: [],
          counts: emptyCounts()
        };
      const students = [...new Set(scope.students.map((student) => student.studentId))];
      const results: AssignmentRepositoryUpdateRow[] = [];
      const notify = (studentId?: string): void => {
        try {
          onProgress?.({
            courseFolderId: request.courseFolderId,
            termCode: request.termCode,
            assignmentSlug: request.assignmentSlug,
            completed: results.length,
            total: students.length,
            ...(studentId === undefined ? {} : { studentId })
          });
        } catch {
          // A closed renderer must not interrupt safe updates or leak batch ownership.
        }
      };
      notify(students[0]);
      for (const studentId of students) {
        let result: GradingStudentRepositoryUpdateResult;
        try {
          result = await dependencies.updateStudent({ ...request, studentId });
        } catch {
          result = { status: "repository_update_failed", message: failureMessage };
        }
        results.push(describeResult(studentId, result));
        notify(students[results.length]);
      }
      const counts = {
        total: results.length,
        updated: results.filter((row) => row.outcome === "updated").length,
        unchanged: results.filter((row) => row.outcome === "unchanged").length,
        failure: results.filter((row) => row.outcome === "failure").length,
        notDownloaded: results.filter((row) => row.outcome === "not_downloaded").length
      };
      return {
        status: counts.failure > 0 || counts.notDownloaded > 0 ? "partial_success" : "success",
        results,
        counts
      };
    } finally {
      activeAssignments.delete(key);
    }
  };
