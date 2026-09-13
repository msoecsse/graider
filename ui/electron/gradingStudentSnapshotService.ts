import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";
import type { AppliedCommentDto } from "./gradingStudentCommentService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository,
  type LocalRepositoryResolution
} from "./localRepositoryLocator.js";
import { readLocalRepositoryHead, type LocalRepositoryHeadResult } from "./localRepositoryHead.js";

export interface GradingStudentSnapshotRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
}

export interface ManualAdjustmentDto {
  readonly id: string;
  readonly rubricCategoryId: string;
  readonly amount: number;
  readonly note?: string;
}

export interface RubricCategoryScoreDto {
  readonly id: string;
  readonly name: string;
  readonly pointsPossible: number;
  readonly score: number;
  readonly categorizedCommentAdjustmentTotal: number;
  readonly manualAdjustmentTotal: number;
}

export interface GradeCalculationDto {
  readonly pointsPossible: number;
  readonly totalScore: number;
  readonly categories: readonly RubricCategoryScoreDto[];
  readonly uncategorizedCommentAdjustmentTotal: number;
}

export type GradingStudentSnapshotResult =
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
      readonly appliedComments: readonly AppliedCommentDto[];
      readonly manualAdjustments: readonly ManualAdjustmentDto[];
      readonly grade: GradeCalculationDto;
    }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error"
        | "student_not_accessible"
        | "repository_not_recorded"
        | "repository_unavailable"
        | "registry_error"
        | "submission_commit_unavailable";
    }
  | { readonly status: "submission_changed"; readonly studentId: string }
  | {
      readonly status: "grading_state_error" | "assignment_config_error";
      readonly studentId: string;
      readonly code: string;
    };

interface BackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly currentSubmissionCommitSha: string;
}

export interface GradingStudentSnapshotBackend {
  loadGradingStudentSnapshotContext(request: BackendRequest): GradingStudentSnapshotResult;
}

export interface GradingStudentSnapshotDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveRepository: (request: GradingStudentSnapshotRequest) => LocalRepositoryResolution;
  readonly readHead: (repositoryRoot: string) => Promise<LocalRepositoryHeadResult>;
  readonly loadBackend: () => GradingStudentSnapshotBackend;
}

const loadBackend = (): GradingStudentSnapshotBackend =>
  require(
    path.join(__dirname, "gradingStudentSnapshotBackend.cjs")
  ) as GradingStudentSnapshotBackend;

export const createGradingStudentSnapshotService = (
  dependencies: Partial<GradingStudentSnapshotDependencies> = {}
): ((request: GradingStudentSnapshotRequest) => Promise<GradingStudentSnapshotResult>) => {
  const resolveFacultyScope = dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveRepository =
    dependencies.resolveRepository ??
    ((request: GradingStudentSnapshotRequest) =>
      resolveLocalStudentRepository(getLocalRepositoryLocatorPath(request.userDataPath), request));
  const readHead = dependencies.readHead ?? readLocalRepositoryHead;
  const getBackend = dependencies.loadBackend ?? loadBackend;
  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };
    const repository = resolveRepository(request);
    if (repository.status !== "success") return repository;
    const head = await readHead(repository.localPath);
    if (head.status !== "success") return head;
    return getBackend().loadGradingStudentSnapshotContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId,
      currentSubmissionCommitSha: head.submissionCommitSha
    });
  };
};

export const loadGradingStudentSnapshot = (
  request: GradingStudentSnapshotRequest
): Promise<GradingStudentSnapshotResult> => createGradingStudentSnapshotService()(request);
