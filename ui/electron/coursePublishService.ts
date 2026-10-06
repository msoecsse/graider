import fs from "node:fs";
import path from "node:path";

import type {
  CoursePublishActionResult,
  CoursePublishStatusResult,
  CourseSetupDiagnostic
} from "./ipc.js";
import {
  createRelativeGitPath,
  getProductionGitWorkspaceFactory,
  type GitRepositoryInspection,
  type GitRepositoryState,
  type GitWorkspaceInspectionFactory,
  type GitWorkspaceWriterFactory
} from "./gitWorkspaceReader.js";

const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const COMMIT_MESSAGE = "Publish Graider course changes";
const ALLOWED_PATH =
  /^(?:course\.yml|\.graider\/grading\/comments\.json|terms\/[^/]+\/term\.yml|terms\/[^/]+\/rosters\/(?:[^/]+\.csv|section-[A-Za-z0-9][A-Za-z0-9_-]*\.source\.json)|terms\/[^/]+\/assignments\/[^/]+\/(?:assignment\.yml|groups\.csv|\.github\/workflows\/grade\.yml))$/u;

const normalizeChangedPath = (entry: string): string | null => {
  const candidate = entry.replaceAll("\\", "/");
  return candidate.includes("..") || candidate === "" ? null : candidate;
};

const inspectChangedFiles = (
  paths: readonly string[]
): { readonly allowed: readonly string[]; readonly unrelated: readonly string[] } => {
  const allowed: string[] = [];
  const unrelated: string[] = [];
  for (const entry of paths) {
    const changedPath = normalizeChangedPath(entry);
    if (changedPath !== null && ALLOWED_PATH.test(changedPath)) allowed.push(changedPath);
    else unrelated.push(changedPath ?? "unrecognized changed path");
  }
  return { allowed, unrelated };
};

const statusResult = (
  status: CoursePublishStatusResult["status"],
  values: Omit<CoursePublishStatusResult, "status">
): CoursePublishStatusResult => ({ status, ...values });

export const getCoursePublishStatus = async (
  courseFolderPath: string,
  factory: GitWorkspaceInspectionFactory = getProductionGitWorkspaceFactory()
): Promise<CoursePublishStatusResult> => {
  const root = path.resolve(courseFolderPath);
  if (!fs.existsSync(root))
    return statusResult("failure", {
      courseFolderPath: root,
      currentBranch: null,
      upstreamBranch: null,
      aheadCount: null,
      allowedChangedFiles: [],
      unrelatedChangedFiles: [],
      diagnostics: [diagnostic("Selected course folder is unavailable.")]
    });
  const base = {
    courseFolderPath: root,
    currentBranch: null,
    upstreamBranch: null,
    aheadCount: null,
    allowedChangedFiles: [],
    unrelatedChangedFiles: []
  };
  let repository: GitRepositoryInspection;
  try {
    repository = await factory.inspect(root);
  } catch {
    return statusResult("failure", {
      ...base,
      diagnostics: [diagnostic("Unable to inspect course repository publish readiness.")]
    });
  }
  if (repository.kind === "not_repository")
    return statusResult("not_git_repo", {
      ...base,
      diagnostics: [diagnostic("The selected course folder is not a git repository.")]
    });
  if (repository.kind === "unavailable")
    return statusResult("failure", {
      ...base,
      diagnostics: [diagnostic("Unable to inspect course repository publish readiness.")]
    });
  let state: GitRepositoryState;
  try {
    state = await (await factory.open(root)).inspect();
  } catch {
    return statusResult("failure", {
      ...base,
      diagnostics: [diagnostic("Unable to inspect course repository publish readiness.")]
    });
  }
  if (state.head.kind !== "attached")
    return statusResult("failure", {
      ...base,
      diagnostics: [diagnostic("Unable to inspect course repository publish readiness.")]
    });
  const changedPaths = [
    ...state.workingTree.trackedChanges.map((change) => change.path),
    ...state.workingTree.stagedChanges.map((change) => change.path),
    ...state.workingTree.untrackedPaths,
    ...state.workingTree.conflicts.map((conflict) => conflict.path)
  ];
  const files = inspectChangedFiles([...new Set(changedPaths)]);
  const withFiles = {
    ...base,
    currentBranch: state.head.branch,
    allowedChangedFiles: files.allowed,
    unrelatedChangedFiles: files.unrelated
  };
  if (state.upstream.kind === "missing")
    return statusResult("no_upstream", {
      ...withFiles,
      diagnostics: [
        diagnostic("This course repository branch does not have an upstream branch configured.")
      ]
    });
  const checked = {
    ...withFiles,
    upstreamBranch: state.upstream.branch,
    aheadCount: state.upstream.ahead
  };
  if (files.allowed.length > 0)
    return statusResult("changes_pending", {
      ...checked,
      diagnostics: [
        diagnostic("Graider-managed course changes are local and have not been published.")
      ]
    });
  if (state.upstream.ahead > 0)
    return statusResult("unpushed", {
      ...checked,
      diagnostics: [diagnostic("Course repository has local commits that have not been pushed.")]
    });
  if (files.unrelated.length > 0)
    return statusResult("unrelated_changes", {
      ...checked,
      diagnostics: [
        diagnostic("Only unrelated local changes are present; Graider will not stage them.")
      ]
    });
  return statusResult("up_to_date", {
    ...checked,
    diagnostics: [diagnostic("Course admin repository is up to date.")]
  });
};

export const publishCourseChanges = async (
  courseFolderPath: string,
  factory: GitWorkspaceWriterFactory = getProductionGitWorkspaceFactory()
): Promise<CoursePublishActionResult> => {
  const status = await getCoursePublishStatus(courseFolderPath, factory);
  if (status.status === "up_to_date" || status.status === "unrelated_changes")
    return { status: "up_to_date", diagnostics: status.diagnostics, commitMessage: null };
  if (status.status !== "changes_pending" && status.status !== "unpushed")
    return { status: "failure", diagnostics: status.diagnostics, commitMessage: null };
  let workspace: Awaited<ReturnType<GitWorkspaceWriterFactory["open"]>>;
  try {
    workspace = await factory.open(status.courseFolderPath);
  } catch {
    return {
      status: "failure",
      diagnostics: [diagnostic("Unable to inspect staged course changes.")],
      commitMessage: null
    };
  }
  if (status.status === "changes_pending") {
    let currentState: GitRepositoryState;
    try {
      currentState = await workspace.inspect();
    } catch {
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to inspect staged course changes.")],
        commitMessage: null
      };
    }
    if (
      inspectChangedFiles(currentState.workingTree.stagedChanges.map((change) => change.path))
        .unrelated.length > 0
    )
      return {
        status: "failure",
        diagnostics: [
          diagnostic(
            "Unrelated files are already staged. Unstage them before publishing course changes."
          )
        ],
        commitMessage: null
      };
    const paths = status.allowedChangedFiles.map(createRelativeGitPath);
    if (paths.some((changedPath) => changedPath === null))
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to stage Graider-managed course changes.")],
        commitMessage: null
      };
    try {
      await workspace.stage(paths.filter((changedPath) => changedPath !== null));
    } catch {
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to stage Graider-managed course changes.")],
        commitMessage: null
      };
    }
    try {
      await workspace.commit({ message: COMMIT_MESSAGE });
    } catch {
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to commit Graider-managed course changes.")],
        commitMessage: null
      };
    }
  }
  try {
    await workspace.pushUpstream();
  } catch {
    return {
      status: "failure",
      diagnostics: [diagnostic("Unable to push course changes to the configured upstream branch.")],
      commitMessage: null
    };
  }
  return {
    status: "success",
    diagnostics: [
      ...(status.unrelatedChangedFiles.length > 0
        ? [diagnostic("Unrelated local changes were not staged or published.")]
        : []),
      diagnostic("Graider-managed course changes were committed and pushed.")
    ],
    commitMessage: status.status === "changes_pending" ? COMMIT_MESSAGE : null
  };
};
