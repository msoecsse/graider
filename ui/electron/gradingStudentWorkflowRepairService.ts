import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

export interface GradingStudentWorkflowRepairRequest extends FacultyScopeServiceRequest {
  readonly courseFolderId: string;
  readonly assignmentSlug: string;
  readonly studentId: string;
  readonly confirmed: boolean;
}

export interface GradingStudentWorkflowRepairOperationDto {
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly defaultBranch: string;
  };
  readonly workflow: {
    readonly status:
      | "created"
      | "replaced_managed"
      | "replaced_unmanaged"
      | "replaced_unsupported"
      | "already_current"
      | "read_failed"
      | "write_failed"
      | "not_attempted";
    readonly commitSha?: string;
  };
  readonly dispatch: { readonly status: "dispatched" | "failed" | "not_attempted" };
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
}

export type GradingStudentWorkflowRepairResult =
  | { readonly status: "ready"; readonly studentId: string; readonly repositoryFullName: string }
  | {
      readonly status: "success";
      readonly studentId: string;
      readonly result: GradingStudentWorkflowRepairOperationDto;
    }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error"
        | "student_not_accessible"
        | "assignment_config_error"
        | "grading_not_eligible"
        | "grading_state_error"
        | "submission_commit_unavailable"
        | "repository_not_recorded"
        | "repository_unavailable"
        | "github_auth_unavailable"
        | "github_operation_failed";
      readonly studentId?: string;
    };

interface PreparedContext {
  readonly studentId: string;
  readonly repository: { readonly owner: string; readonly name: string };
  readonly grading: unknown;
  readonly submissionCommitSha: string;
}

type PrepareResult =
  | { readonly status: "success"; readonly value: PreparedContext }
  | Exclude<GradingStudentWorkflowRepairResult, { readonly status: "success" | "ready" }>;

interface WorkflowRepairBackend {
  prepareGradingStudentWorkflowRepairContext(request: {
    readonly courseFolderPath: string;
    readonly termCode: string;
    readonly assignmentSlug: string;
    readonly studentId: string;
  }): PrepareResult;
  executePreparedGradingStudentWorkflowRepair(
    prepared: PreparedContext,
    token: string,
    confirmed: boolean
  ): Promise<
    Extract<
      GradingStudentWorkflowRepairResult,
      {
        readonly status: "success" | "ready" | "repository_unavailable" | "github_operation_failed";
      }
    >
  >;
}

export interface GradingStudentWorkflowRepairDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly resolveToken: () => Promise<GithubTokenResolution>;
  readonly loadBackend: () => WorkflowRepairBackend;
}

const loadBackend = (): WorkflowRepairBackend =>
  (
    require(path.join(__dirname, "gradingStudentWorkflowRepairBackend.cjs")) as {
      gradingStudentWorkflowRepairBackend: WorkflowRepairBackend;
    }
  ).gradingStudentWorkflowRepairBackend;

export const createGradingStudentWorkflowRepairService = (
  overrides: Partial<GradingStudentWorkflowRepairDependencies> = {}
): ((
  request: GradingStudentWorkflowRepairRequest
) => Promise<GradingStudentWorkflowRepairResult>) => {
  const resolveFacultyScope = overrides.resolveFacultyScope ?? resolveCurrentFacultyScope;
  const resolveToken =
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }));
  const getBackend = overrides.loadBackend ?? loadBackend;

  return async (request) => {
    const scope = resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible", studentId: request.studentId };

    const backend = getBackend();
    const prepared = backend.prepareGradingStudentWorkflowRepairContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      studentId: request.studentId
    });
    if (prepared.status !== "success") return prepared;

    const token = await resolveToken();
    if (token.status === "failure")
      return { status: "github_auth_unavailable", studentId: request.studentId };
    return await backend.executePreparedGradingStudentWorkflowRepair(
      prepared.value,
      token.token,
      request.confirmed
    );
  };
};

export const repairGradingStudentWorkflow = (
  request: GradingStudentWorkflowRepairRequest
): Promise<GradingStudentWorkflowRepairResult> =>
  createGradingStudentWorkflowRepairService()(request);
