import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getAssignmentForEdit } from "./assignmentEditService.js";
import { getStudentRepositoryAccessPageStatus } from "./studentRepositoryAccessPageService.js";
import type { AssignmentRepositoryMappings } from "./assignmentRepositoryMappingsRunner.js";
import type {
  CourseSetupDiagnostic,
  StudentRepositoryAccessPagePublishChecks,
  StudentRepositoryAccessPagePublishResult,
  StudentRepositoryAccessPageRequest
} from "./ipc.js";

const execFileAsync = promisify(execFile);
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

const runGit = async (
  repositoryFolderPath: string,
  arguments_: readonly string[]
): Promise<{ readonly ok: boolean; readonly stdout: string }> => {
  try {
    const result = await execFileAsync("git", arguments_, {
      cwd: repositoryFolderPath,
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: result.stdout.trim() };
  } catch {
    return { ok: false, stdout: "" };
  }
};

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
  mappings: AssignmentRepositoryMappings
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
  const repository = await runGit(pagesFolderPath, ["rev-parse", "--show-toplevel"]);
  if (!repository.ok)
    return resultFromAccessPage(request, accessPage, "not_git_repo", initialChecks, [
      ...accessPage.diagnostics,
      diagnostic(
        "This Pages repository folder does not appear to be a git repository. Graider cannot determine whether the access page is published."
      )
    ]);

  const [pageStatus, allStatus, branch, remote] = await Promise.all([
    runGit(pagesFolderPath, ["status", "--porcelain", "--", accessPage.outputPath]),
    runGit(pagesFolderPath, ["status", "--porcelain"]),
    runGit(pagesFolderPath, ["branch", "--show-current"]),
    runGit(pagesFolderPath, ["remote", "get-url", "origin"])
  ]);
  if (!pageStatus.ok || !allStatus.ok || !branch.ok)
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      { ...initialChecks, isGitRepository: true },
      [...accessPage.diagnostics, diagnostic("Unable to inspect local git publish readiness.")]
    );

  const hasUncommittedAccessPage = pageStatus.stdout !== "";
  const hasUncommittedOtherChanges =
    allStatus.stdout !== "" && (pageStatus.stdout === "" || allStatus.stdout !== pageStatus.stdout);
  const baseChecks = {
    ...initialChecks,
    pagesRepositoryFolderSelected: true,
    isGitRepository: true,
    currentBranch: branch.stdout === "" ? null : branch.stdout,
    hasUncommittedAccessPage,
    hasUncommittedOtherChanges,
    remoteMatchesConfiguredRepository:
      remote.ok && accessPage.pagesRepository !== null
        ? remote.stdout.replace(/\.git$/u, "").endsWith(`/${accessPage.pagesRepository}`)
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
  const upstream = await runGit(pagesFolderPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}"
  ]);
  if (!upstream.ok) {
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
  const divergence = await runGit(pagesFolderPath, [
    "rev-list",
    "--left-right",
    "--count",
    "@{u}...HEAD"
  ]);
  const divergenceCounts = divergence.ok ? divergence.stdout.match(/^(\d+)\s+(\d+)$/u) : null;
  const behindCount = divergenceCounts === null ? null : Number(divergenceCounts[1]);
  const aheadCount = divergenceCounts === null ? null : Number(divergenceCounts[2]);
  if (behindCount === null || aheadCount === null)
    return resultFromAccessPage(
      request,
      accessPage,
      "failure",
      { ...baseChecks, upstreamBranch: upstream.stdout, aheadCount, behindCount },
      [
        ...accessPage.diagnostics,
        ...remoteDiagnostic,
        diagnostic("Unable to determine whether local commits have been pushed.")
      ]
    );
  const checks = { ...baseChecks, upstreamBranch: upstream.stdout, aheadCount, behindCount };
  if (behindCount > 0)
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
  if (aheadCount > 0)
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
