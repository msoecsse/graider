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
}) => {
  // A single ephemeral preview per renderer owner; selecting again replaces it.
  const sessions = new Map<number, Session>();
  const prepare = async (request: Assignment) => {
    if (!isValidGradingWorkspaceIdentity(request)) throw new Error("Invalid assignment identity.");
    const scope = (dependencies.scope ?? resolveCurrentFacultyScope)(request);
    if (scope.status !== "success") throw new Error(`Review import unavailable: ${scope.status}.`);
    const repositories = new Map<string, string>();
    for (const student of scope.students) {
      const resolved = (dependencies.repository ?? resolveLocalStudentRepository)(
        getLocalRepositoryLocatorPath(request.userDataPath),
        { ...request, studentId: student.studentId }
      );
      if (resolved.status === "success") repositories.set(student.studentId, resolved.localPath);
    }
    const context = await dependencies
      .backend()
      .createContext(request, scope.students, repositories);
    return { context, students: scope.students };
  };
  return {
    close: (owner: number): void => {
      sessions.delete(owner);
    },
    choose: async (request: Assignment, owner: number): Promise<Backend.ImportPreview | null> => {
      if (!isValidGradingWorkspaceIdentity(request))
        throw new Error("Invalid assignment identity.");
      if (sessions.get(owner)?.applying) throw new Error("Review import is already applying.");
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
      const { context, students } = await prepare(request);
      const preview: Backend.ImportPreview = {
        planId: randomUUID(),
        version: 1,
        plan: await backend.plan(inputs, context),
        students
      };
      sessions.set(owner, { request: { ...request }, inputs, preview, applying: false });
      return preview;
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
