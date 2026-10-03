import path from "node:path";

import { createNodeProcessRunner } from "./commandRunner.js";
import type { CourseSetupDiagnostic, StudentPagesAccessResult } from "./ipc.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

interface PagesAccessBackendResult {
  readonly status: StudentPagesAccessResult["status"];
  readonly granted: readonly string[];
  readonly removed: readonly string[];
  readonly failed: readonly { readonly githubUsername: string }[];
  readonly diagnostics: readonly string[];
}

interface PagesAccessBackend {
  readonly syncStudentPagesAccess: (
    request: { readonly courseFolderPath: string },
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
): ((courseFolderPath: string) => Promise<StudentPagesAccessResult>) => {
  const resolveToken =
    overrides.resolveToken ??
    (async () => await resolveGithubToken({ runner: createNodeProcessRunner() }));
  const getBackend = overrides.loadBackend ?? loadBackend;

  return async (courseFolderPath) => {
    const token = await resolveToken();
    if (token.status === "failure")
      return failure(
        "GitHub sign-in is unavailable, so student access to the Pages site was not checked."
      );
    try {
      const result = await getBackend().syncStudentPagesAccess({ courseFolderPath }, token.token);
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
  courseFolderPath: string
): Promise<StudentPagesAccessResult> => createStudentPagesAccessService()(courseFolderPath);

// Runs only after a successful save or Apply, and never changes that outcome.
export const withStudentPagesAccess = async <T extends { readonly status: string }>(
  courseFolderPath: string,
  result: T,
  sync: (courseFolderPath: string) => Promise<StudentPagesAccessResult> = syncStudentPagesAccess
): Promise<T & { readonly pagesAccess?: StudentPagesAccessResult }> =>
  result.status === "success" ? { ...result, pagesAccess: await sync(courseFolderPath) } : result;
