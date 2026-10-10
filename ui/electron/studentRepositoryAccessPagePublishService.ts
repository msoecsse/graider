import {
  authenticateGitPublication,
  type GitPublicationOptions
} from "./gitPublicationAuthentication.js";
import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

import type { AssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type {
  CourseSetupDiagnostic,
  StudentRepositoryAccessPagePublishActionResult,
  StudentRepositoryAccessPageRequest
} from "./ipc.js";
import {
  createRelativeGitPath,
  getProductionGitWorkspaceFactory,
  type GitWorkspaceWriterFactory
} from "./gitWorkspaceReader.js";
import { getStudentRepositoryAccessPagePublishStatus } from "./studentRepositoryAccessPagePublishStatusService.js";

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });

const isContainedPath = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== "..";
};

const failure = (message: string): StudentRepositoryAccessPagePublishActionResult => ({
  status: "failure",
  diagnostics: [diagnostic(message)],
  commitMessage: null
});

const getConfiguredPagesBranch = (courseFolderPath: string): string | null => {
  try {
    const document = parseDocument(
      fs.readFileSync(path.join(courseFolderPath, "course.yml"), "utf8")
    );
    const branch = document.getIn(["notifications", "student_access_pages", "branch"]);
    return typeof branch === "string" && branch.trim() !== "" ? branch.trim() : null;
  } catch {
    return null;
  }
};

export const publishStudentRepositoryAccessPage = async (
  request: StudentRepositoryAccessPageRequest,
  mappings: AssignmentRepositoryMappings,
  options: GitPublicationOptions
): Promise<StudentRepositoryAccessPagePublishActionResult> => {
  const factory = options.factory ?? getProductionGitWorkspaceFactory();
  const readiness = await getStudentRepositoryAccessPagePublishStatus(request, mappings, factory);
  const repositoryFolderPath = request.pagesRepositoryFolderPath;
  if (repositoryFolderPath === null || repositoryFolderPath === undefined)
    return failure("Select the local Pages repository folder before publishing the access page.");
  if (readiness.status === "not_generated")
    return failure("Generate the student access page before publishing it.");
  if (readiness.status === "not_git_repo")
    return failure("The selected Pages repository folder is not a git repository.");
  if (readiness.status === "no_upstream")
    return failure("This Pages repository branch does not have an upstream branch configured.");
  if (readiness.status === "behind_upstream")
    return failure(
      "The local Pages repository must be pulled, rebased, or synchronized with its upstream before publishing the access page."
    );
  if (
    readiness.status === "failure" ||
    readiness.status === "pages_folder_not_selected" ||
    readiness.status === "pages_unknown"
  )
    return failure(
      "Student Access Pages are not ready to publish. Review the publish readiness diagnostics."
    );
  if (readiness.checks.remoteMatchesConfiguredRepository === false)
    return failure(
      "The local Pages repository remote does not match the configured Pages repository."
    );
  const configuredBranch = getConfiguredPagesBranch(request.courseFolderPath);
  if (
    configuredBranch !== null &&
    readiness.checks.currentBranch !== null &&
    configuredBranch !== readiness.checks.currentBranch
  )
    return failure(
      "The local Pages repository branch does not match the configured Student Access Pages branch."
    );

  const repositoryRoot = path.resolve(repositoryFolderPath);
  const pagePath = path.resolve(repositoryRoot, readiness.outputPath);
  if (!isContainedPath(repositoryRoot, pagePath) || !fs.existsSync(pagePath))
    return failure(
      "The generated student access page is unavailable inside the selected Pages repository."
    );

  if (readiness.status === "ready_to_publish")
    return {
      status: "up_to_date",
      diagnostics: [diagnostic("The student access page is already committed and pushed.")],
      commitMessage: null
    };

  const commitMessage = `Publish student access page for ${readiness.assignmentSlug ?? "assignment"}`;
  const outputPath = createRelativeGitPath(readiness.outputPath);
  if (outputPath === null) return failure("Unable to stage the generated student access page.");
  const authenticated = await authenticateGitPublication(options);
  if (authenticated === null)
    return failure("GitHub authentication is required to publish the student access page.");
  let workspace: Awaited<ReturnType<GitWorkspaceWriterFactory["open"]>>;
  try {
    workspace = await authenticated.factory.open(repositoryRoot);
    const currentState = await workspace.inspect();
    if (currentState.head.kind !== "attached" || currentState.upstream.kind === "missing")
      return failure("This Pages repository branch does not have an upstream branch configured.");
    if (currentState.upstream.behind > 0)
      return failure(
        "The local Pages repository must be pulled, rebased, or synchronized with its upstream before publishing the access page."
      );
    if (configuredBranch !== null && currentState.head.branch !== configuredBranch)
      return failure(
        "The local Pages repository branch does not match the configured Student Access Pages branch."
      );
  } catch {
    return failure(
      "Student Access Pages are not ready to publish. Review the publish readiness diagnostics."
    );
  }
  if (readiness.status === "uncommitted") {
    try {
      await workspace.stage([outputPath]);
    } catch {
      return failure("Unable to stage the generated student access page.");
    }
    try {
      await workspace.commit({ message: commitMessage });
    } catch {
      return failure("Unable to commit the generated student access page.");
    }
  }
  try {
    await workspace.pushUpstream({ authentication: authenticated.authentication });
  } catch {
    return failure("Unable to push the student access page to the configured upstream branch.");
  }
  return {
    status: "success",
    diagnostics: [
      ...(readiness.checks.hasUncommittedOtherChanges
        ? [diagnostic("Unrelated local changes were not staged or published.")]
        : []),
      diagnostic("Student access page was committed and pushed.")
    ],
    commitMessage
  };
};
