import { getAssignmentForEdit } from "./assignmentEditService.js";
import {
  createRelativeGitPath,
  getProductionGitWorkspaceFactory,
  type GitRepositoryInspection,
  type GitRepositoryState,
  type GitWorkspaceInspectionFactory
} from "./gitWorkspaceReader.js";
import { getStudentRepositoryAccessPageStatus } from "./studentRepositoryAccessPageService.js";
import type { AssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type {
  CourseSetupDiagnostic,
  StudentRepositoryAccessPagePublishChecks,
  StudentRepositoryAccessPagePublishResult,
  StudentRepositoryAccessPageRequest
} from "./ipc.js";

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const emptyChecks = (
  fileExists = false,
  pagesUrlAvailable = false
): StudentRepositoryAccessPagePublishChecks => ({
  pagesRepositoryFolderSelected: false,
  fileExists,
  isGitRepository: false,
  currentBranch: null,
  hasUncommittedAccessPage: false,
  hasUncommittedOtherChanges: false,
  upstreamBranch: null,
  aheadCount: null,
  behindCount: null,
  pagesUrlAvailable,
  remoteMatchesConfiguredRepository: null
});
const quoteCommandArgument = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

const changedPaths = (state: GitRepositoryState): readonly string[] => [
  ...state.workingTree.trackedChanges.map((change) => change.path),
  ...state.workingTree.stagedChanges.map((change) => change.path),
  ...state.workingTree.untrackedPaths,
  ...state.workingTree.conflicts.map((conflict) => conflict.path)
];

const resultFromAccessPage = (
  request: StudentRepositoryAccessPageRequest,
  accessPage: Awaited<ReturnType<typeof getStudentRepositoryAccessPageStatus>>,
  status: StudentRepositoryAccessPagePublishResult["status"],
  checks: StudentRepositoryAccessPagePublishChecks,
  diagnostics: readonly CourseSetupDiagnostic[],
  suggestedCommands: readonly string[] = []
): StudentRepositoryAccessPagePublishResult => ({
  schemaVersion: 1,
  assignmentFile: request.assignmentFile,
  termCode: accessPage.termCode,
  assignmentSlug: accessPage.assignmentSlug,
  outputPath: accessPage.outputPath,
  pagesRepositoryFolderPath: request.pagesRepositoryFolderPath ?? null,
  pagesUrl: accessPage.pagesUrl,
  status,
  checks,
  suggestedCommands,
  diagnostics
});

export const getStudentRepositoryAccessPagePublishStatus = async (
  request: StudentRepositoryAccessPageRequest,
  mappings: AssignmentRepositoryMappings,
  factory: GitWorkspaceInspectionFactory = getProductionGitWorkspaceFactory()
): Promise<StudentRepositoryAccessPagePublishResult> => {
  const accessPage = await getStudentRepositoryAccessPageStatus(request, mappings);
  const initialChecks = {
    ...emptyChecks(accessPage.exists, accessPage.pagesUrl !== null),
    pagesRepositoryFolderSelected: accessPage.pagesRepositoryFolderSelected
  };
  if (accessPage.pagesRepository === null)
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      initialChecks,
      accessPage.diagnostics
    );
  if (!accessPage.pagesRepositoryFolderSelected)
    return resultFromAccessPage(request, accessPage, "pages_folder_not_selected", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic("Select the local Pages repository folder before checking publish readiness.")
    ]);
  if (accessPage.status === "failure")
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      initialChecks,
      accessPage.diagnostics
    );
  if (!accessPage.exists)
    return resultFromAccessPage(request, accessPage, "not_generated", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic("Generate the student access page before publishing the Canvas link.")
    ]);

  const pagesFolderPath = request.pagesRepositoryFolderPath;
  if (pagesFolderPath === null || pagesFolderPath === undefined)
    return resultFromAccessPage(request, accessPage, "pages_folder_not_selected", initialChecks, [
      diagnostic("Select the local Pages repository folder before checking publish readiness.")
    ]);
  let repository: GitRepositoryInspection;
  try {
    repository = await factory.inspect(pagesFolderPath);
  } catch {
    return resultFromAccessPage(request, accessPage, "failure", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic("Unable to inspect local git publish readiness.")
    ]);
  }
  if (repository.kind === "not_repository")
    return resultFromAccessPage(request, accessPage, "not_git_repo", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic(
        "This Pages repository folder does not appear to be a git repository. Graider cannot determine whether the access page is published."
      )
    ]);
  if (repository.kind === "unavailable")
    return resultFromAccessPage(request, accessPage, "failure", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic("Unable to inspect local git publish readiness.")
    ]);
  const outputPath = createRelativeGitPath(accessPage.outputPath);
  if (outputPath === null)
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      { ...initialChecks, isGitRepository: true },
      [...accessPage.diagnostics, diagnostic("Unable to inspect local git publish readiness.")]
    );
  let fullState: GitRepositoryState;
  let pageState: GitRepositoryState;
  let remoteUrl: string | null;
  try {
    const workspace = await factory.open(pagesFolderPath);
    [fullState, pageState, remoteUrl] = await Promise.all([
      workspace.inspect(),
      workspace.inspect({ paths: [outputPath] }),
      workspace.remoteUrl("origin").catch(() => null)
    ]);
  } catch {
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      { ...initialChecks, isGitRepository: true },
      [...accessPage.diagnostics, diagnostic("Unable to inspect local git publish readiness.")]
    );
  }
  const hasUncommittedAccessPage = changedPaths(pageState).length > 0;
  const hasUncommittedOtherChanges = changedPaths(fullState).some(
    (changedPath) => changedPath !== outputPath
  );
  const currentBranch =
    fullState.head.kind === "attached" || fullState.head.kind === "unborn"
      ? fullState.head.branch
      : null;
  const baseChecks = {
    ...initialChecks,
    pagesRepositoryFolderSelected: true,
    isGitRepository: true,
    currentBranch,
    hasUncommittedAccessPage,
    hasUncommittedOtherChanges,
    remoteMatchesConfiguredRepository:
      remoteUrl !== null && accessPage.pagesRepository !== null
        ? remoteUrl.replace(/\.git$/u, "").endsWith(`/${accessPage.pagesRepository}`)
        : null
  };
  const assignment = getAssignmentForEdit(request.courseFolderPath, request.assignmentFile);
  const label = assignment.model?.assignmentTitle ?? accessPage.assignmentSlug ?? "assignment";
  const commitCommands = [
    `git add ${quoteCommandArgument(accessPage.outputPath)}`,
    `git commit -m ${quoteCommandArgument(`Add ${label} student repository access page`)}`
  ];
  const remoteDiagnostic =
    baseChecks.remoteMatchesConfiguredRepository === false
      ? [diagnostic("The Pages repository remote may not match the configured Pages repository.")]
      : baseChecks.remoteMatchesConfiguredRepository === null
        ? [
            diagnostic(
              "Unable to verify that the Pages repository remote matches the configured repository."
            )
          ]
        : [];
  if (fullState.upstream.kind === "missing") {
    if (hasUncommittedAccessPage)
      return resultFromAccessPage(
        request,
        accessPage,
        "uncommitted",
        baseChecks,
        [
          ...accessPage.diagnostics,
          diagnostic("The access page exists locally but has not been committed yet.")
        ],
        commitCommands
      );
    const pushCommand =
      baseChecks.currentBranch === null
        ? []
        : [`git push -u origin ${quoteCommandArgument(baseChecks.currentBranch)}`];
    return resultFromAccessPage(
      request,
      accessPage,
      "no_upstream",
      baseChecks,
      [
        ...accessPage.diagnostics,
        ...remoteDiagnostic,
        diagnostic("This branch does not have an upstream branch configured.")
      ],
      pushCommand
    );
  }
  const checks = {
    ...baseChecks,
    upstreamBranch: fullState.upstream.branch,
    aheadCount: fullState.upstream.ahead,
    behindCount: fullState.upstream.behind
  };
  if (fullState.upstream.behind > 0)
    return resultFromAccessPage(request, accessPage, "behind_upstream", checks, [
      ...accessPage.diagnostics,
      ...remoteDiagnostic,
      diagnostic(
        "The local Pages repository must be pulled, rebased, or synchronized with its upstream before publishing the access page."
      )
    ]);
  if (hasUncommittedAccessPage)
    return resultFromAccessPage(
      request,
      accessPage,
      "uncommitted",
      checks,
      [
        ...accessPage.diagnostics,
        diagnostic("The access page exists locally but has not been committed yet.")
      ],
      commitCommands
    );
  if (fullState.upstream.ahead > 0)
    return resultFromAccessPage(
      request,
      accessPage,
      "unpushed",
      checks,
      [
        ...accessPage.diagnostics,
        ...remoteDiagnostic,
        diagnostic(
          "The access page appears committed locally but has not been pushed to GitHub yet."
        )
      ],
      ["git push"]
    );
  if (accessPage.pagesUrl === null)
    return resultFromAccessPage(request, accessPage, "pages_unknown", checks, [
      ...accessPage.diagnostics,
      ...remoteDiagnostic
    ]);
  return resultFromAccessPage(request, accessPage, "ready_to_publish", checks, [
    ...accessPage.diagnostics,
    ...remoteDiagnostic,
    diagnostic(
      "Local publishing checks look ready. Confirm GitHub Pages is enabled before posting the link in Canvas."
    )
  ]);
};
