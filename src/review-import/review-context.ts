import type { LoadedGraiderConfig } from "../config/config-models.js";
import type { Manifest } from "../manifest/manifest-models.js";
import {
  findStudentRepositoryMapping,
  normalizeManifestRepositories
} from "../manifest/repository-targets.js";
import type { RosterStudent } from "../roster/roster-models.js";
import {
  loadGradingState,
  type GradingStatePathRequest,
  type LoadGradingStateResult
} from "../grading/grading-state.js";
import { resolveGradingSubmissionContext } from "../grading/grading-submission-context.js";
import { diagnostic } from "./review-input.js";
import type { ReviewImportContext } from "./review-plan-models.js";

export interface ReviewContextRequest {
  readonly config: LoadedGraiderConfig;
  readonly manifest: Manifest;
  /** Assignment roster, already restricted to the current faculty's sections. */
  readonly students: readonly Pick<RosterStudent, "studentId" | "githubUsername">[];
  /** Trusted current heads from the canonical local repository locator. */
  readonly currentHeads: ReadonlyMap<string, string>;
  readonly repository: ReviewImportContext["repository"];
}
export type ReviewContextResult =
  | { readonly status: "success"; readonly context: ReviewImportContext }
  | { readonly status: "invalid_context" };
/** Adapter for the existing config/manifest/submission services. It loads state
 * once per student and never writes. Missing state uses a supplied canonical HEAD. */
export const createReviewImportContext = (
  request: ReviewContextRequest,
  loadState: (request: GradingStatePathRequest) => LoadGradingStateResult = loadGradingState
): ReviewContextResult => {
  const { config, manifest } = request;
  const assignment = {
    courseCode: config.course.course.code,
    termCode: config.summary.termCode,
    assignmentSlug: config.summary.assignmentSlug
  };
  if (
    manifest.assignment.courseCode !== assignment.courseCode ||
    manifest.assignment.termCode !== assignment.termCode ||
    manifest.assignment.assignmentSlug !== assignment.assignmentSlug
  )
    return { status: "invalid_context" };
  const normalized = normalizeManifestRepositories(manifest);
  return {
    status: "success",
    context: {
      assignment,
      rubric: config.assignment.grading?.rubric ?? [],
      repository: request.repository,
      submissions: request.students.map((student) => {
        const mappings = normalized.studentMappings.filter(
          (mapping) => mapping.studentId === student.studentId
        );
        const mapping = findStudentRepositoryMapping(normalized, student.studentId);
        const owner =
          manifest.schemaVersion === 1
            ? manifest.repositories.find((record) => record.studentId === student.studentId)
                ?.repository.owner
            : config.course.github.organization;
        const stateRequest = {
          courseRoot: config.summary.repoRoot,
          termCode: assignment.termCode,
          assignmentSlug: assignment.assignmentSlug,
          studentId: student.studentId
        };
        const loaded = loadState(stateRequest);
        const submission = resolveGradingSubmissionContext(
          {
            courseFolderPath: config.summary.repoRoot,
            termCode: assignment.termCode,
            assignmentSlug: assignment.assignmentSlug,
            studentId: student.studentId,
            currentSubmissionCommitSha: request.currentHeads.get(student.studentId)
          },
          { loadState: () => loaded }
        );
        const consistentMapping =
          mappings.length === 1 &&
          mapping?.githubUsername.toLowerCase() === student.githubUsername.toLowerCase();
        return {
          student: { ...student },
          repository:
            consistentMapping && owner !== undefined
              ? { owner, name: mapping.repositoryName }
              : null,
          currentCommitSha:
            submission.status === "success" ? submission.value.submissionCommitSha : null,
          gradingState: loaded.status === "success" ? loaded.value : null,
          diagnostics:
            submission.status === "success"
              ? []
              : [
                  diagnostic(
                    submission.status,
                    "Canonical submission or grading state is unavailable or has changed."
                  )
                ]
        };
      })
    }
  };
};
