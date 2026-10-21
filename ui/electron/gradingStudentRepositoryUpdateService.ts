import path from "node:path";
import { resolveCurrentFacultyScope } from "./facultyScopeService.js";
import {
  getLocalRepositoryLocatorPath,
  resolveLocalStudentRepository
} from "./localRepositoryLocator.js";
import type { GradingStudentSourceRequest } from "./gradingStudentSourceService.js";
import { createNodeProcessRunner } from "./commandRunner.js";
import { authenticateGitPublication } from "./gitPublicationAuthentication.js";
import type { GitAuthenticationContextRef, GitWorkspaceWriter } from "./gitWorkspaceReader.js";

export interface RepositoryUpdateWorkspace extends GitWorkspaceWriter {
  resolveHead(): Promise<string>;
  readRevisionFile(revision: string, file: string): Promise<string | null>;
  pullUpstream(request: {
    readonly authentication: GitAuthenticationContextRef;
    readonly expectedHead: string;
    readonly externalFastForward?: { readonly expectedRemote: string };
  }): Promise<
    | { readonly kind: "updated" | "conflict" }
    | { readonly kind: "refused"; readonly message: string }
  >;
}
export interface RepositoryUpdateBackend {
  updateGradingStudentRepository(
    request: {
      courseRoot: string;
      termCode: string;
      assignmentSlug: string;
      studentId: string;
    },
    workspace: {
      resolveHead(): Promise<string>;
      readRevisionFile(revision: string, file: string): Promise<string | null>;
      pullUpstream(request: {
        readonly expectedHead: string;
        readonly externalFastForward?: { readonly expectedRemote: string };
      }): Promise<
        | { readonly kind: "updated" | "conflict" }
        | { readonly kind: "refused"; readonly message: string }
      >;
    }
  ): Promise<GradingStudentRepositoryUpdateResult>;
}
export interface GradingStudentRepositoryUpdateResult {
  readonly status: string;
  readonly message?: string;
}
export const createGradingStudentRepositoryUpdateService =
  (
    overrides: {
      resolveFacultyScope?: typeof resolveCurrentFacultyScope;
      resolveRepository?: typeof resolveLocalStudentRepository;
      authenticate?: typeof authenticateGitPublication;
      loadBackend?: () => RepositoryUpdateBackend;
    } = {}
  ) =>
  async (request: GradingStudentSourceRequest): Promise<GradingStudentRepositoryUpdateResult> => {
    const scope = (overrides.resolveFacultyScope ?? resolveCurrentFacultyScope)(request);
    if (scope.status !== "success") return { status: scope.status };
    if (!scope.students.some((student) => student.studentId === request.studentId))
      return { status: "student_not_accessible" };
    const repository = (overrides.resolveRepository ?? resolveLocalStudentRepository)(
      getLocalRepositoryLocatorPath(request.userDataPath),
      request
    );
    if (repository.status !== "success") return repository;
    const authenticated = await (overrides.authenticate ?? authenticateGitPublication)({
      runner: createNodeProcessRunner()
    });
    if (authenticated === null) return { status: "github_auth_unavailable" };
    try {
      // The production authenticated backend returns the full Git workspace. The
      // publication interface exposes only the subset needed by other services.
      const workspace = (await authenticated.factory.open(
        repository.localPath
      )) as RepositoryUpdateWorkspace;
      const backend = (
        overrides.loadBackend ??
        (() =>
          require(
            path.join(__dirname, "gradingStudentRepositoryUpdateBackend.cjs")
          ) as RepositoryUpdateBackend)
      )();
      return await backend.updateGradingStudentRepository(
        {
          courseRoot: request.courseFolderPath,
          termCode: request.termCode,
          assignmentSlug: request.assignmentSlug,
          studentId: request.studentId
        },
        {
          resolveHead: () => workspace.resolveHead(),
          readRevisionFile: (revision, file) => workspace.readRevisionFile(revision, file),
          pullUpstream: (update) =>
            workspace.pullUpstream({ ...update, authentication: authenticated.authentication })
        }
      );
    } catch {
      return { status: "repository_update_failed" };
    }
  };
export const pullLatestGradingStudentChanges = createGradingStudentRepositoryUpdateService();
