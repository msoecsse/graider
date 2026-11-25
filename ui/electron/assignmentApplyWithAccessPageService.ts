import type { GitPublicationOptions } from "./gitPublicationAuthentication.js";
import { applyAssignment } from "./assignmentApplyRunner.js";
import type { AssignmentApplyRepositoryProgress } from "./assignmentApplyRunner.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type { ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentApplyRequest,
  AssignmentApplyResult,
  DashboardCommandError
} from "./ipc.js";
import { generateStudentRepositoryAccessPage } from "./studentRepositoryAccessPageService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";

interface AssignmentApplyWithAccessPageOptions extends GitPublicationOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly pagesRepositoryFolderPath: string | null;
  readonly onProgress?: (progress: AssignmentApplyRepositoryProgress) => void;
}

const pageGenerationError = (
  diagnostics: readonly { readonly message: string }[]
): DashboardCommandError => ({
  code: "student_repository_access_page_generation_failed",
  message:
    diagnostics.map((item) => item.message).join(" ") ||
    "Unable to generate the student repository access page.",
  exitCode: null,
  stdoutSnippet: null,
  stderrSnippet: null
});

const pagePublicationError = (
  diagnostics: readonly { readonly message: string }[]
): DashboardCommandError => ({
  code: "student_repository_access_page_publication_failed",
  message:
    diagnostics.map((item) => item.message).join(" ") ||
    "Unable to publish the student repository access page.",
  exitCode: null,
  stdoutSnippet: null,
  stderrSnippet: null
});

export const applyAssignmentWithStudentRepositoryAccessPage = async (
  request: AssignmentApplyRequest,
  options: AssignmentApplyWithAccessPageOptions
): Promise<AssignmentApplyResult> => {
  const result = await applyAssignment(request, options);
  if (result.status === "failure" || result.apply === null) return result;

  // Follow-up wall time only; never collect request metadata or exception details.
  const startedAt = performance.now();
  const phases: Record<
    "repositoryMappings" | "generation" | "publication",
    { readonly elapsedMs: number } | null
  > = { repositoryMappings: null, generation: null, publication: null };
  const measure = async <T>(
    phase: keyof typeof phases,
    operation: () => Promise<T>
  ): Promise<T> => {
    const phaseStartedAt = performance.now();
    try {
      return await operation();
    } finally {
      phases[phase] = { elapsedMs: performance.now() - phaseStartedAt };
    }
  };

  const accessRequest = {
    ...request,
    pagesRepositoryFolderPath: options.pagesRepositoryFolderPath
  };
  let createAccessPageError = pageGenerationError;
  let accessPageError: DashboardCommandError | undefined;
  try {
    const mappings = await measure("repositoryMappings", () =>
      getAssignmentRepositoryMappings({
        ...accessRequest,
        runner: options.runner
      })
    );
    const accessPage = await measure("generation", () =>
      generateStudentRepositoryAccessPage(accessRequest, mappings)
    );

    if (accessPage.status === "failure")
      accessPageError = pageGenerationError(accessPage.diagnostics);
    else {
      createAccessPageError = pagePublicationError;
      const publication = await measure("publication", () =>
        publishStudentRepositoryAccessPage(accessRequest, mappings, options)
      );
      if (publication.status === "failure")
        accessPageError = pagePublicationError(publication.diagnostics);
    }
  } catch {
    // Follow-up failures must preserve Apply outcomes and omit raw exception details.
    accessPageError = createAccessPageError([]);
  }
  return {
    ...result,
    ...(accessPageError === undefined ? {} : { accessPageError }),
    apply: {
      ...result.apply,
      summary: {
        ...result.apply.summary,
        accessPagePerformance: { elapsedMs: performance.now() - startedAt, phases }
      }
    }
  };
};
