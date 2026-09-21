import path from "node:path";

export interface AssignmentGradingLifecycleStudentRow {
  readonly studentId: string;
  readonly githubUsername: string;
  readonly section: string;
  readonly gradingStatus: "not_started" | "in_progress" | "complete" | "published" | "unknown";
  readonly score: number | null;
}

export type AssignmentGradingLifecycleResult =
  | {
      readonly status: "success";
      readonly students: readonly AssignmentGradingLifecycleStudentRow[];
      readonly totalStudentCount: number;
      readonly gradingDoneCount: number;
      readonly publishedCount: number;
      readonly unknownStatusCount: number;
      readonly pointsPossible: number;
    }
  | { readonly status: "assignment_config_error" };

export interface AssignmentGradingLifecycleRequest {
  readonly courseFolderId: string;
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}

interface AssignmentGradingLifecycleBackendRequest {
  readonly courseFolderPath: string;
  readonly termCode: string;
  readonly assignmentSlug: string;
}

interface AssignmentGradingLifecycleBackend {
  resolveAssignmentGradingLifecycleContext(
    request: AssignmentGradingLifecycleBackendRequest
  ): AssignmentGradingLifecycleResult;
}

export interface AssignmentGradingLifecycleDependencies {
  readonly backend: AssignmentGradingLifecycleBackend;
}

const loadBackend = (): AssignmentGradingLifecycleBackend =>
  require(
    path.join(__dirname, "assignmentGradingLifecycleBackend.cjs")
  ) as AssignmentGradingLifecycleBackend;

export const createAssignmentGradingLifecycleService = (
  dependencies: Partial<AssignmentGradingLifecycleDependencies> = {}
): ((request: AssignmentGradingLifecycleRequest) => AssignmentGradingLifecycleResult) => {
  const backend = dependencies.backend ?? loadBackend();
  return (request) =>
    backend.resolveAssignmentGradingLifecycleContext({
      courseFolderPath: request.courseFolderPath,
      termCode: request.termCode,
      assignmentSlug: request.assignmentSlug
    });
};

export const getAssignmentGradingLifecycle = (
  request: AssignmentGradingLifecycleRequest
): AssignmentGradingLifecycleResult => createAssignmentGradingLifecycleService()(request);
