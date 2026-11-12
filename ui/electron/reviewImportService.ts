import {
  revalidateCourseOperation,
  withReviewImportPreparation
} from "./managedCourseOperationContext.js";
import { isValidGradingWorkspaceIdentity } from "./gradingWorkspaceService.js";
import { isPrepareGradingWorkspaceRequest } from "./gradingWorkspaceRequestValidation.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { resolveCurrentFacultyScope } from "./facultyScopeService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository
} from "./localRepositoryLocator.js";
import type * as Backend from "../dist-electron/reviewImportBackend.cjs";
export type {
  ImportAssignment,
  ImportPreview,
  ImportApplyRequest,
  ImportResult,
  ImportSelection,
  FindingPlan
} from "../dist-electron/reviewImportBackend.cjs";
type BackendApi = typeof Backend;
type Assignment = Backend.ImportAssignment & { readonly userDataPath: string };
interface Session {
  readonly request: Assignment;
  readonly inputs: readonly { filename: string; content: string }[];
  readonly preview: Backend.ImportPreview;
  applying: boolean;
}
const sameAssignment = (left: Assignment, right: Assignment): boolean =>
  left.courseFolderId === right.courseFolderId &&
  left.courseFolderPath === right.courseFolderPath &&
  left.termCode === right.termCode &&
  left.assignmentSlug === right.assignmentSlug &&
  left.userDataPath === right.userDataPath;
export const isImportApplyRequest = (value: unknown): value is Backend.ImportApplyRequest => {
  if (typeof value !== "object" || value === null) return false;
  const request = value as Backend.ImportApplyRequest;
  const assignment = {
    courseFolderId: request.courseFolderId,
    courseFolderPath: request.courseFolderPath,
    termCode: request.termCode,
    assignmentSlug: request.assignmentSlug
  };
  return (
    isPrepareGradingWorkspaceRequest(assignment) &&
    isValidGradingWorkspaceIdentity(assignment) &&
    typeof request.planId === "string" &&
    request.version === 1 &&
    Array.isArray(request.selections) &&
    request.selections.every(
      (selection: Backend.ImportSelection) =>
        typeof selection === "object" &&
        selection !== null &&
        Object.keys(selection).every((key) =>
          ["reviewIndex", "studentId", "findingKey", "approved"].includes(key)
        ) &&
        Number.isInteger(selection.reviewIndex) &&
        selection.reviewIndex >= 0 &&
        typeof selection.studentId === "string" &&
        typeof selection.findingKey === "string" &&
        typeof selection.approved === "boolean"
    )
  );
};
export const createReviewImportService = (dependencies: {
  readonly backend: () => BackendApi;
  readonly showOpenDialog: (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
  readonly scope?: typeof resolveCurrentFacultyScope;
  readonly repository?: typeof resolveLocalStudentRepository;
  readonly synchronize?: (
    request: Assignment & { readonly studentId: string },
    proof: {
      readonly reviewedCommitShas: readonly string[];
      readonly expectedRepositoryRemote: string;
    },
    revalidate: () => Promise<void>
  ) => Promise<{ readonly status: string; readonly message?: string }>;
}) => {
  // A single ephemeral preview per renderer owner; selecting again replaces it.
  const sessions = new Map<number, Session>();
  const preparing = new Map<number, symbol>();
  const prepare = async (request: Assignment, studentId?: string) => {
    if (!isValidGradingWorkspaceIdentity(request)) throw new Error("Invalid assignment identity.");
    const scope = (dependencies.scope ?? resolveCurrentFacultyScope)(request);
    if (scope.status !== "success") throw new Error(`Review import unavailable: ${scope.status}.`);
    const students = scope.students.filter(
      (student) => studentId === undefined || student.studentId === studentId
    );
    const repositories = new Map<string, string>();
    for (const student of students) {
      const resolved = (dependencies.repository ?? resolveLocalStudentRepository)(
        getLocalRepositoryLocatorPath(request.userDataPath),
        { ...request, studentId: student.studentId }
      );
      if (resolved.status === "success") repositories.set(student.studentId, resolved.localPath);
    }
    const context = await dependencies.backend().createContext(request, students, repositories);
    return { context, students };
  };
  return {
    close: (owner: number): void => {
      sessions.delete(owner);
      preparing.delete(owner);
    },
    choose: async (request: Assignment, owner: number): Promise<Backend.ImportPreview | null> => {
      if (!isValidGradingWorkspaceIdentity(request))
        throw new Error("Invalid assignment identity.");
      if (sessions.get(owner)?.applying || preparing.has(owner))
        throw new Error("Review import is already preparing or applying.");
      const operation = Symbol();
      preparing.set(owner, operation);
      try {
        const chosen = await dependencies.showOpenDialog({
          title: "Import Reviews",
          properties: ["openFile", "multiSelections"],
          filters: [{ name: "Review JSON", extensions: ["json"] }]
        });
        if (chosen.canceled || chosen.filePaths.length === 0) return null;
        sessions.delete(owner);
        const backend = dependencies.backend();
        const inputs = chosen.filePaths.map((file) => {
          let content = "";
          // Use Slice 1 constants to bound trusted reads before parsing. The planner
          // remains the authority for batch/size/schema classifications.
          if (chosen.filePaths.length <= backend.MAX_REVIEW_FILES) {
            try {
              const descriptor = fs.openSync(file, "r");
              try {
                const buffer = Buffer.alloc(backend.MAX_REVIEW_FILE_BYTES + 1);
                const length = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
                content = buffer.subarray(0, length).toString("utf8");
              } finally {
                fs.closeSync(descriptor);
              }
            } catch {
              content = "";
            }
          }
          return { filename: path.basename(file), content };
        });
        return await withReviewImportPreparation(async () => {
          const assertCurrent = (): void => {
            if (preparing.get(owner) !== operation)
              throw new Error("Review preview expired. Reopen Import Reviews.");
          };
          assertCurrent();
          const initial = await prepare(request);
          let context = initial.context;
          let plan = await backend.plan(inputs, context);
          const affected = new Set(
            plan.reviews
              .filter(
                (review) => review.shaState === "unavailable" || review.shaState === "unrelated"
              )
              .flatMap((review) =>
                review.matchedStudent === undefined ? [] : [review.matchedStudent.studentId]
              )
          );
          const synchronization: Backend.ImportSynchronization[] = [];
          for (const studentId of affected) {
            const submission = initial.context.submissions.find(
              (entry) => entry.student.studentId === studentId
            );
            const repository = submission?.repository;
            if (submission === undefined || repository == null)
              throw new Error("Student repository identity is unavailable.");
            const revalidate = async (): Promise<void> => {
              assertCurrent();
              const fresh = await prepare(request, studentId);
              const current = fresh.context.submissions.find(
                (entry) => entry.student.studentId === studentId
              );
              if (
                JSON.stringify(current?.repository) !== JSON.stringify(repository) ||
                JSON.stringify(current?.student) !== JSON.stringify(submission.student)
              )
                throw new Error("Student repository authorization changed.");
              assertCurrent();
            };
            let result: { readonly status: string; readonly message?: string };
            try {
              await revalidate();
              result =
                dependencies.synchronize === undefined
                  ? { status: "github_auth_unavailable" }
                  : await dependencies.synchronize(
                      { ...request, studentId },
                      {
                        expectedRepositoryRemote: `https://github.com/${repository.owner}/${repository.name}.git`,
                        reviewedCommitShas: [
                          ...new Set(
                            plan.reviews
                              .filter((review) => review.matchedStudent?.studentId === studentId)
                              .flatMap((review) =>
                                review.review === undefined
                                  ? []
                                  : [review.review.repository.reviewedCommitSha]
                              )
                          )
                        ]
                      },
                      revalidate
                    );
            } catch {
              result = {
                status: "repository_update_failed",
                message:
                  "Repository synchronization could not finish safely. Check faculty access, repository status, and your GitHub session, then reopen Import Reviews."
              };
            }
            synchronization.push({
              studentId,
              status:
                result.status === "success" || result.status === "unchanged" ? "success" : "failed",
              code: result.status,
              message:
                result.message ??
                (result.status === "github_auth_unavailable"
                  ? "GitHub authentication is unavailable. Sign in to Graider, then reopen Import Reviews."
                  : "Repository synchronization could not finish safely. Check repository status, local changes, and remote access, then reopen Import Reviews.")
            });
          }
          if (affected.size > 0) {
            context = (await prepare(request)).context;
            for (const [index, update] of synchronization.entries()) {
              if (update.status === "success") {
                const current = context.submissions.find(
                  (entry) => entry.student.studentId === update.studentId
                );
                const original = initial.context.submissions.find(
                  (entry) => entry.student.studentId === update.studentId
                );
                if (
                  current?.currentCommitSha == null ||
                  current.diagnostics.length > 0 ||
                  JSON.stringify(current.repository) !== JSON.stringify(original?.repository) ||
                  JSON.stringify(current.student) !== JSON.stringify(original?.student)
                )
                  synchronization[index] = {
                    ...update,
                    status: "failed",
                    code: "synchronized_context_changed",
                    message:
                      "The repository may have updated, but submission consistency or authorization changed. Review repository and grading status before reopening Import Reviews."
                  };
                else
                  synchronization[index] = {
                    ...update,
                    currentCommitSha: current.currentCommitSha,
                    message: `Updated local repository for ${update.studentId} to ${current.currentCommitSha}. Review findings have been revalidated against the latest submission.`
                  };
              }
            }
            context = {
              ...context,
              submissions: context.submissions.map((submission) => {
                const failure = synchronization.find(
                  (update) =>
                    update.studentId === submission.student.studentId && update.status === "failed"
                );
                return failure === undefined
                  ? submission
                  : {
                      ...submission,
                      diagnostics: [{ code: failure.code, message: failure.message }]
                    };
              })
            };
            plan = await backend.plan(inputs, context);
          }
          assertCurrent();
          const preview: Backend.ImportPreview = {
            planId: randomUUID(),
            version: 1,
            plan,
            students: initial.students,
            ...(synchronization.length === 0 ? {} : { synchronization })
          };
          sessions.set(owner, { request: { ...request }, inputs, preview, applying: false });
          return preview;
        });
      } finally {
        if (preparing.get(owner) === operation) preparing.delete(owner);
      }
    },
    apply: async (
      request: Backend.ImportApplyRequest & { readonly userDataPath: string },
      owner: number
    ): Promise<Backend.ImportResult> => {
      if (!isImportApplyRequest(request)) throw new Error("Invalid review selections.");
      const session = sessions.get(owner);
      if (
        session === undefined ||
        session.applying ||
        !sameAssignment(session.request, request) ||
        session.preview.planId !== request.planId ||
        session.preview.version !== request.version
      )
        throw new Error("Review preview expired. Reopen Import Reviews.");
      session.applying = true;
      const outcomes: Backend.ImportOutcome[] = [];
      try {
        const { context } = await prepare(session.request);
        // Replan retained trusted inputs against fresh faculty, manifest, rubric,
        // repository history and grading state; never accept renderer plan objects.
        const fresh = await dependencies.backend().plan(session.inputs, context);
        await revalidateCourseOperation();
        const seen = new Set<string>();
        for (const selected of request.selections) {
          const originalReview = session.preview.plan.reviews[selected.reviewIndex];
          const original = originalReview?.findings.find(
            (finding) => finding.key === selected.findingKey
          );
          const currentReview = fresh.reviews[selected.reviewIndex];
          const current = currentReview?.findings.find(
            (finding) => finding.key === selected.findingKey
          );
          const fail = (message: string): void => {
            outcomes.push({
              studentId: selected.studentId,
              findingKey: selected.findingKey,
              status: "failed",
              message
            });
          };
          const identity = JSON.stringify([selected.reviewIndex, selected.findingKey]);
          if (seen.has(identity)) fail("Repeated selection.");
          else if (
            original === undefined ||
            !original.eligibleToApply ||
            originalReview?.matchedStudent?.studentId !== selected.studentId ||
            currentReview?.matchedStudent?.studentId !== selected.studentId ||
            current === undefined
          )
            fail("Finding or student is no longer eligible. Reopen Import Reviews.");
          else if (
            originalReview.currentCommitSha !== currentReview.currentCommitSha ||
            JSON.stringify(original.rubric) !== JSON.stringify(current.rubric) ||
            JSON.stringify(original.anchor) !== JSON.stringify(current.anchor)
          )
            fail("Submission, rubric or recovery changed. Reopen Import Reviews.");
          else if (current.duplicate)
            outcomes.push({
              studentId: selected.studentId,
              findingKey: selected.findingKey,
              status: "duplicate",
              message: "Already imported; faculty edits preserved."
            });
          else if ((original.requiresApproval || current.requiresApproval) && !selected.approved)
            fail("Explicit faculty approval is required.");
          else if (
            !current.eligibleToApply ||
            current.operation !== "add_comment" ||
            currentReview.currentCommitSha === undefined
          )
            fail("Finding is blocked by current validation.");
          else {
            try {
              outcomes.push(
                dependencies
                  .backend()
                  .applyFinding(
                    session.request,
                    context,
                    selected.studentId,
                    current,
                    currentReview.currentCommitSha,
                    currentReview.review!.repository.reviewedCommitSha
                  )
              );
            } catch {
              fail("Finding could not be saved. Other successful additions are preserved.");
            }
          }
          seen.add(identity);
        }
        return {
          applied: outcomes.filter((item) => item.status === "applied").length,
          duplicatesSkipped: outcomes.filter((item) => item.status === "duplicate").length,
          failed: outcomes.filter((item) => item.status === "failed").length,
          studentsAffected: new Set(
            outcomes.filter((item) => item.status === "applied").map((item) => item.studentId)
          ).size,
          outcomes
        };
      } finally {
        session.applying = false;
      }
    }
  };
};
export const loadReviewImportBackend = (): BackendApi =>
  require(path.join(__dirname, "reviewImportBackend.cjs")) as BackendApi;
