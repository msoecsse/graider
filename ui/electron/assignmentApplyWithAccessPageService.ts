import { applyAssignment } from "./assignmentApplyRunner.js";
import { getAssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type { ProcessRunner } from "./commandRunner.js";
import type {
  AssignmentApplyRequest,
  AssignmentApplyResult,
  DashboardCommandError
} from "./ipc.js";
import { generateStudentRepositoryAccessPage } from "./studentRepositoryAccessPageService.js";
import { publishStudentRepositoryAccessPage } from "./studentRepositoryAccessPagePublishService.js";

interface AssignmentApplyWithAccessPageOptions {
  readonly runner: ProcessRunner;
  readonly env?: NodeJS.ProcessEnv;
  readonly pagesRepositoryFolderPath: string | null;
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
  if (result.status === "failure") return result;

  const accessRequest = {
    ...request,
    pagesRepositoryFolderPath: options.pagesRepositoryFolderPath
  };
  const mappings = await getAssignmentRepositoryMappings({
    ...accessRequest,
    runner: options.runner
  });
  const accessPage = await generateStudentRepositoryAccessPage(accessRequest, mappings);

  if (accessPage.status === "failure")
    return { ...result, status: "failure", error: pageGenerationError(accessPage.diagnostics) };

  const publication = await publishStudentRepositoryAccessPage(accessRequest, mappings);
  return publication.status === "failure"
    ? { ...result, status: "failure", error: pagePublicationError(publication.diagnostics) }
    : result;
};
