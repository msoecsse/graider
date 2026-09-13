import path from "node:path";
import {
  resolveCurrentFacultyScope,
  type FacultyScopeServiceRequest,
  type FacultyScopeServiceResult
} from "./facultyScopeService.js";

const TERM_CODE_PATTERN = /^\d{2}s[123]$/u;
const ASSIGNMENT_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export interface GradingWorkspaceRequest extends FacultyScopeServiceRequest {
  readonly assignmentSlug: string;
}

export interface GradingWorkspaceAssignment {
  readonly termCode: string;
  readonly slug: string;
  readonly title: string;
}

export interface GradingWorkspaceStudent {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published";
}

export interface GradingWorkspaceRubricCategory {
  readonly id: string;
  readonly name: string;
  readonly points: number;
}

export type GradingWorkspaceResult =
  | {
      readonly status: "success";
      readonly assignment: GradingWorkspaceAssignment;
      readonly requiredFiles: readonly string[];
      readonly rubric: readonly GradingWorkspaceRubricCategory[];
      readonly students: readonly GradingWorkspaceStudent[];
    }
  | {
      readonly status:
        | "faculty_identity_required"
        | "no_assigned_sections"
        | "roster_error"
        | "term_config_error";
    }
  | { readonly status: "assignment_config_error" }
  | { readonly status: "grading_state_error"; readonly studentId: string; readonly code: string };

interface GradingWorkspaceBackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
  readonly students: readonly {
    readonly studentId: string;
    readonly githubUsername: string;
    readonly section: string;
  }[];
}

interface GradingWorkspaceBackend {
  resolveGradingWorkspaceContext(request: GradingWorkspaceBackendRequest): GradingWorkspaceResult;
}

export interface GradingWorkspaceDependencies {
  readonly resolveFacultyScope: (request: FacultyScopeServiceRequest) => FacultyScopeServiceResult;
  readonly backend: GradingWorkspaceBackend;
}

const loadBackend = (): GradingWorkspaceBackend =>
  require(path.join(__dirname, "gradingWorkspaceBackend.cjs")) as GradingWorkspaceBackend;

const isValidIdentity = (request: GradingWorkspaceRequest): boolean =>
  TERM_CODE_PATTERN.test(request.termCode) && ASSIGNMENT_SLUG_PATTERN.test(request.assignmentSlug);

export const createGradingWorkspaceService = (
  dependencies: Partial<GradingWorkspaceDependencies> = {}
): ((request: GradingWorkspaceRequest) => GradingWorkspaceResult) => {
  const services: GradingWorkspaceDependencies = {
    resolveFacultyScope: dependencies.resolveFacultyScope ?? resolveCurrentFacultyScope,
    backend: dependencies.backend ?? loadBackend()
  };
  return (request) => {
    if (!isValidIdentity(request)) return { status: "assignment_config_error" };
    const scope = services.resolveFacultyScope(request);
    if (scope.status !== "success") return { status: scope.status };
    return services.backend.resolveGradingWorkspaceContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug,
      students: scope.students
    });
  };
};

export const prepareGradingWorkspace = (request: GradingWorkspaceRequest): GradingWorkspaceResult =>
  createGradingWorkspaceService()(request);
