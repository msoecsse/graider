import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import type {
  CoursePublishActionResult,
  CoursePublishStatusResult,
  CourseSetupDiagnostic
} from "./ipc.js";

const execFileAsync = promisify(execFile);
const diagnostic = (message: string): CourseSetupDiagnostic => ({ message });
const COMMIT_MESSAGE = "Publish Graider course changes";
const ALLOWED_PATH =
  /^(?:course\.yml|terms\/[^/]+\/term\.yml|terms\/[^/]+\/rosters\/[^/]+\.csv|terms\/[^/]+\/assignments\/[^/]+\/assignment\.yml|terms\/[^/]+\/assignments\/[^/]+\/\.github\/workflows\/grade\.yml)$/u;

const runGit = async (
  courseFolderPath: string,
  arguments_: readonly string[]
): Promise<{ readonly ok: boolean; readonly stdout: string }> => {
  try {
    const result = await execFileAsync("git", arguments_, {
      cwd: courseFolderPath,
      shell: false,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: result.stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
};

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
  courseFolderPath: string
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
  const repository = await runGit(root, ["rev-parse", "--show-toplevel"]);
  const base = {
    courseFolderPath: root,
    currentBranch: null,
    upstreamBranch: null,
    aheadCount: null,
    allowedChangedFiles: [],
    unrelatedChangedFiles: []
  };
  if (!repository.ok)
    return statusResult("not_git_repo", {
      ...base,
      diagnostics: [diagnostic("The selected course folder is not a git repository.")]
    });
  const [unstaged, staged, untracked, branch, upstream] = await Promise.all([
    runGit(root, ["diff", "--name-only", "-z"]),
    runGit(root, ["diff", "--cached", "--name-only", "-z"]),
    runGit(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
    runGit(root, ["branch", "--show-current"]),
    runGit(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
  ]);
  if (!unstaged.ok || !staged.ok || !untracked.ok || !branch.ok || branch.stdout.trim() === "")
    return statusResult("failure", {
      ...base,
      diagnostics: [diagnostic("Unable to inspect course repository publish readiness.")]
    });
  const files = inspectChangedFiles(
    [
      ...unstaged.stdout.split("\u0000"),
      ...staged.stdout.split("\u0000"),
      ...untracked.stdout.split("\u0000")
    ].filter((item) => item !== "")
  );
  const withFiles = {
    ...base,
    currentBranch: branch.stdout.trim(),
    allowedChangedFiles: files.allowed,
    unrelatedChangedFiles: files.unrelated
  };
  if (!upstream.ok)
    return statusResult("no_upstream", {
      ...withFiles,
      diagnostics: [
        diagnostic("This course repository branch does not have an upstream branch configured.")
      ]
    });
  const ahead = await runGit(root, ["rev-list", "--count", "@{u}..HEAD"]);
  const aheadCount = ahead.ok && /^\d+\s*$/u.test(ahead.stdout) ? Number(ahead.stdout) : null;
  if (aheadCount === null)
    return statusResult("failure", {
      ...withFiles,
      upstreamBranch: upstream.stdout.trim(),
      diagnostics: [diagnostic("Unable to determine whether course commits have been pushed.")]
    });
  const checked = { ...withFiles, upstreamBranch: upstream.stdout.trim(), aheadCount };
  if (files.allowed.length > 0)
    return statusResult("changes_pending", {
      ...checked,
      diagnostics: [
        diagnostic("Graider-managed course changes are local and have not been published.")
      ]
    });
  if (aheadCount > 0)
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
  courseFolderPath: string
): Promise<CoursePublishActionResult> => {
  const status = await getCoursePublishStatus(courseFolderPath);
  if (status.status === "up_to_date" || status.status === "unrelated_changes")
    return { status: "up_to_date", diagnostics: status.diagnostics, commitMessage: null };
  if (status.status !== "changes_pending" && status.status !== "unpushed")
    return { status: "failure", diagnostics: status.diagnostics, commitMessage: null };
  if (status.status === "changes_pending") {
    const staged = await runGit(status.courseFolderPath, ["diff", "--cached", "--name-only", "-z"]);
    if (!staged.ok)
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to inspect staged course changes.")],
        commitMessage: null
      };
    if (
      inspectChangedFiles(staged.stdout.split("\u0000").filter((item) => item !== "")).unrelated
        .length > 0
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
    if (!(await runGit(status.courseFolderPath, ["add", "--", ...status.allowedChangedFiles])).ok)
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to stage Graider-managed course changes.")],
        commitMessage: null
      };
    if (!(await runGit(status.courseFolderPath, ["commit", "-m", COMMIT_MESSAGE])).ok)
      return {
        status: "failure",
        diagnostics: [diagnostic("Unable to commit Graider-managed course changes.")],
        commitMessage: null
      };
  }
  if (!(await runGit(status.courseFolderPath, ["push"])).ok)
    return {
      status: "failure",
      diagnostics: [diagnostic("Unable to push course changes to the configured upstream branch.")],
      commitMessage: null
    };
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
