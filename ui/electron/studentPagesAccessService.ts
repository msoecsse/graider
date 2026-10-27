import path from "node:path";

import { createNodeProcessRunner } from "./commandRunner.js";
import type {
  CourseSetupDiagnostic,
  RosterLoadResult,
  RosterSectionRequest,
  StudentPagesAccessResult
} from "./ipc.js";
import { getRosterForSection } from "./rosterManagerService.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

interface PagesAccessBackendResult {
  readonly status: StudentPagesAccessResult["status"];
  readonly granted: readonly string[];
  readonly removed: readonly string[];
  readonly failed: readonly { readonly githubUsername: string }[];
  readonly diagnostics: readonly string[];
}

export interface PagesAccessRemovedStudents {
  readonly termCode: string;
  readonly githubUsernames: readonly string[];
}

interface PagesAccessBackend {
  readonly syncStudentPagesAccess: (
    request: {
      readonly courseFolderPath: string;
      readonly removedStudents?: PagesAccessRemovedStudents;
    },
    token: string
  ) => Promise<PagesAccessBackendResult>;
}

export interface StudentPagesAccessDependencies {
  readonly resolveToken: () => Promise<GithubTokenResolution>;
  readonly loadBackend: () => PagesAccessBackend;
}

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

const failure = (message: string): StudentPagesAccessResult => ({
  status: "failure",
  granted: [],
  removed: [],
  failedGithubUsernames: [],
  diagnostics: [diagnostic(message)]
});

const loadBackend = (): PagesAccessBackend =>
  (
    require(path.join(__dirname, "pagesAccessBackend.cjs")) as {
      pagesAccessBackend: PagesAccessBackend;
    }
  ).pagesAccessBackend;

export const createStudentPagesAccessService = (
  overrides: Partial<StudentPagesAccessDependencies> = {}
): ((
  courseFolderPath: string,
  removedStudents?: PagesAccessRemovedStudents
) => Promise<StudentPagesAccessResult>) => {
  const resolveToken =
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }));
  const getBackend = overrides.loadBackend ?? loadBackend;

  return async (courseFolderPath, removedStudents) => {
    const token = await resolveToken();
    if (token.status === "failure")
      return failure(
        "GitHub sign-in is unavailable, so student access to the Pages site was not checked."
      );
    try {
      const result = await getBackend().syncStudentPagesAccess(
        removedStudents === undefined
          ? { courseFolderPath }
          : { courseFolderPath, removedStudents },
        token.token
      );
      return {
        status: result.status,
        granted: result.granted,
        removed: result.removed,
        failedGithubUsernames: result.failed.map((item) => item.githubUsername),
        diagnostics: result.diagnostics.map(diagnostic)
      };
    } catch {
      return failure("Unable to check student access to the Pages site.");
    }
  };
};

export const syncStudentPagesAccess = (
  courseFolderPath: string,
  removedStudents?: PagesAccessRemovedStudents
): Promise<StudentPagesAccessResult> =>
  createStudentPagesAccessService()(courseFolderPath, removedStudents);

// Read before a roster or section is removed: afterwards there is no record of who was in it.
// An unreadable roster yields no usernames, so nobody loses access on its account.
export const getRosterStudentsForRemoval = (
  request: RosterSectionRequest,
  loadRoster: (request: RosterSectionRequest) => RosterLoadResult = getRosterForSection
): PagesAccessRemovedStudents => {
  const roster = loadRoster(request);
  return {
    termCode: request.termCode,
    githubUsernames: roster.status === "ready" ? roster.rows.map((row) => row.githubUsername) : []
  };
};

// Runs only after a successful save or Apply, and never changes that outcome.
export const withStudentPagesAccess = async <T extends { readonly status: string }>(
  courseFolderPath: string,
  result: T,
  sync: (courseFolderPath: string) => Promise<StudentPagesAccessResult> = syncStudentPagesAccess
): Promise<T & { readonly pagesAccess?: StudentPagesAccessResult }> =>
  result.status === "success" ? { ...result, pagesAccess: await sync(courseFolderPath) } : result;
