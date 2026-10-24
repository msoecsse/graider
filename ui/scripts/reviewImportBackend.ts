import { randomUUID } from "node:crypto";
import { loadGraiderConfig } from "../../src/config/config-loader.js";
import { loadManifest } from "../../src/manifest/manifest-loader.js";
import { createManifestPath } from "../../src/manifest/manifest-paths.js";
import { createReviewImportContext } from "../../src/review-import/review-context.js";
import { planReviewImport } from "../../src/review-import/review-planner.js";
import { createReviewRepositoryReader } from "../../src/review-import/review-repository.js";
import { createDugiteGitWorkspaceFactory } from "../../src/git/dugite-git-workspace-context.js";
import { loadGradingState } from "../../src/grading/grading-state.js";
import { addGradingStudentCommentContext } from "../../src/grading/applied-comment-context.js";
import { MAX_REVIEW_FILES, MAX_REVIEW_FILE_BYTES } from "../../src/review-import/review-schema.js";
import type { ReviewInput } from "../../src/review-import/review-input.js";
import type {
  ReviewImportPlan,
  FindingPlan,
  ReviewImportContext
} from "../../src/review-import/review-plan-models.js";
export type { ReviewImportPlan, FindingPlan };
export { MAX_REVIEW_FILES, MAX_REVIEW_FILE_BYTES };
export interface ImportAssignment {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}
export interface ImportStudent {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly section: string;
}
export interface ImportSelection {
  readonly reviewIndex: number;
  readonly studentId: string;
  readonly findingKey: string;
  readonly approved: boolean;
}
export interface ImportOutcome {
  readonly studentId: string;
  readonly findingKey: string;
  readonly status: "applied" | "duplicate" | "failed";
  readonly message: string;
}
export interface ImportResult {
  readonly applied: number;
  readonly duplicatesSkipped: number;
  readonly failed: number;
  readonly studentsAffected: number;
  readonly outcomes: readonly ImportOutcome[];
}
export interface ImportPreview {
  readonly planId: string;
  readonly version: 1;
  readonly plan: ReviewImportPlan;
  readonly students: readonly ImportStudent[];
}
export interface ImportApplyRequest extends ImportAssignment {
  readonly planId: string;
  readonly version: 1;
  readonly selections: readonly ImportSelection[];
}
export const createContext = async (
  request: ImportAssignment,
  students: readonly ImportStudent[],
  repositories: ReadonlyMap<string, string>
): Promise<ReviewImportContext> => {
  const config = loadGraiderConfig({
    cwd: request.courseFolderPath,
    assignmentFile: `terms/${request.termCode}/assignments/${request.assignmentSlug}/assignment.yml`
  });
  const manifest = loadManifest(
    createManifestPath(request.courseFolderPath, request.termCode, request.assignmentSlug)
      .absolutePath,
    { required: true }
  );
  if (config.status !== "success" || manifest.status !== "loaded")
    throw new Error("Assignment configuration or manifest is unavailable.");
  const factory = createDugiteGitWorkspaceFactory();
  const heads = new Map<string, string>();
  const readers = new Map<string, Awaited<ReturnType<typeof factory.open>>>();
  for (const student of students) {
    const root = repositories.get(student.studentId);
    if (root !== undefined) {
      try {
        const workspace = await factory.open(root);
        heads.set(student.studentId, await workspace.resolveHead());
        readers.set(student.studentId, workspace);
      } catch {
        /* Missing local history stays blocked by the planner. */
      }
    }
  }
  const result = createReviewImportContext({
    config: config.config,
    manifest: manifest.manifest,
    students,
    currentHeads: heads,
    repository: async (id) => {
      const workspace = readers.get(id);
      return workspace === undefined ? null : createReviewRepositoryReader(workspace);
    }
  });
  if (result.status !== "success")
    throw new Error("Assignment identity does not match the manifest.");
  return result.context;
};
export const plan = (inputs: readonly ReviewInput[], context: ReviewImportContext) =>
  planReviewImport(inputs, context);

/** Synchronous per-finding commit: reload provenance immediately before the ordinary
 * grading operation and save. No await separates this check from the additive write. */
export const applyFinding = (
  request: ImportAssignment,
  context: ReviewImportContext,
  studentId: string,
  finding: FindingPlan,
  canonicalSha: string,
  reviewedSha: string
): ImportOutcome => {
  const outcome = (status: ImportOutcome["status"], message: string): ImportOutcome => ({
    studentId,
    findingKey: finding.key,
    status,
    message
  });
  const target = {
    courseRoot: request.courseFolderPath,
    termCode: request.termCode,
    assignmentSlug: request.assignmentSlug,
    studentId
  };
  const loaded = loadGradingState(target);
  if (loaded.status === "failure") return outcome("failed", "Grading state could not be loaded.");
  const state = loaded.status === "success" ? loaded.value : undefined;
  if (
    state !== undefined &&
    (state.studentId !== studentId || state.submissionCommitSha !== canonicalSha)
  )
    return outcome("failed", "Canonical submission changed. Reopen Import Reviews.");
  if (
    state?.appliedComments.some(
      (comment) =>
        comment.importProvenance?.reviewId === finding.provenance.reviewId &&
        comment.importProvenance.findingId === finding.provenance.findingId
    )
  )
    return outcome("duplicate", "Already imported; existing faculty edits preserved.");
  if (
    !finding.eligibleToApply ||
    finding.operation !== "add_comment" ||
    !context.submissions.some(
      (submission) =>
        submission.student.studentId === studentId && submission.currentCommitSha === canonicalSha
    )
  )
    return outcome("failed", "Finding is no longer applicable.");
  const data = finding.finding;
  const original = finding.anchor.original;
  const updated = addGradingStudentCommentContext(
    {
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId,
      currentSubmissionCommitSha: canonicalSha
    },
    {
      id: randomUUID(),
      text: data.text ?? "",
      deduction: data.deduction,
      ...(data.title === undefined ? {} : { title: data.title }),
      ...(data.tags === undefined ? {} : { tags: [...data.tags] }),
      ...(finding.rubric.categoryId === undefined
        ? {}
        : { rubricCategoryId: finding.rubric.categoryId }),
      ...(finding.anchor.proposed === undefined ? {} : { sourceLocation: finding.anchor.proposed }),
      ...(original === undefined || !finding.recoveryRequired
        ? {}
        : {
            sourceAnchor: {
              status: "relocated" as const,
              originalCommitSha: reviewedSha,
              originalLocation: {
                file: original.file,
                startLine: original.startLine,
                endLine: original.endLine
              },
              originalText: original.excerpt
            }
          }),
      importProvenance: finding.provenance
    },
    undefined,
    { preserveGradingLifecycle: true }
  );
  return updated.status === "success"
    ? outcome("applied", "Applied review finding.")
    : outcome("failed", "code" in updated ? updated.code : updated.status);
};
