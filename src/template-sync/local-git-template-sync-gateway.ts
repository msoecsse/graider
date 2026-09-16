import { execFile as executeFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type {
  ApplyTemplateDeltaInput,
  ApplyTemplateDeltaResult,
  PrepareConflictBranchInput,
  RecoverTemplateAndStudentBaselineInput,
  RecoverStudentBaselineInput,
  StudentRepositoryRef,
  TemplateSyncBaselineRecoveryResult,
  TemplateAndStudentBaselineRecoveryResult,
  TemplateRepositoryRef,
  TemplateSyncGitGateway,
  TemplateTree
} from "./template-sync.js";
import {
  createTemplateSyncOperationError,
  type TemplateSyncFailureStage
} from "./template-sync-failure.js";

const execFile = promisify(executeFile);
const GIT = "git";
const TEMPLATE_UPDATE_MESSAGE = "Apply template update";
const BYTES_PER_MEBIBYTE = 1_048_576;
const MAX_GIT_COMMAND_OUTPUT_MEBIBYTES = 10;
const MAX_GIT_COMMAND_OUTPUT_BYTES = MAX_GIT_COMMAND_OUTPUT_MEBIBYTES * BYTES_PER_MEBIBYTE;

const withFailureStage = async <T>(
  stage: TemplateSyncFailureStage,
  message: string,
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error: unknown) {
    throw createTemplateSyncOperationError(stage, message, error);
  }
};

export interface LocalGitTemplateSyncGatewayOptions {
  /** Clean, local clones; the student clone's origin is the student's repository. */
  templateDirectory: string;
  studentDirectory: string;
}

/**
 * Git-backed gateway for a single already-cloned student repository. It uses
 * `git apply --3way --index`, which applies only the template patch and lets
 * Git detect overlapping student edits. It never creates branches or force-pushes.
 */
export class LocalGitTemplateSyncGateway implements TemplateSyncGitGateway {
  constructor(private readonly options: LocalGitTemplateSyncGatewayOptions) {}

  async getTree(_repository: TemplateRepositoryRef, commitSha: string): Promise<TemplateTree> {
    const { stdout } = await this.git(this.options.templateDirectory, [
      "ls-tree",
      "-r",
      "--format=%(objectname) %(path)",
      commitSha
    ]);
    return Object.fromEntries(
      stdout
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => {
          const separator = line.indexOf(" ");
          return [line.slice(separator + 1), line.slice(0, separator)];
        })
    );
  }

  async getDefaultBranchCommitSha(): Promise<string> {
    const { stdout } = await this.git(this.options.studentDirectory, ["rev-parse", "HEAD"]);
    return stdout.trim();
  }

  async recoverStudentBaseline(
    input: RecoverStudentBaselineInput
  ): Promise<TemplateSyncBaselineRecoveryResult> {
    const templateTreeSha = (
      await this.git(this.options.templateDirectory, [
        "rev-parse",
        `${input.templateCommitSha}^{tree}`
      ])
    ).stdout.trim();
    const history = (
      await this.git(this.options.studentDirectory, [
        "log",
        "--first-parent",
        "--format=%H %T",
        `refs/remotes/origin/${input.studentRepository.defaultBranch}`
      ])
    ).stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const separator = line.indexOf(" ");
        return { commitSha: line.slice(0, separator), treeSha: line.slice(separator + 1) };
      });

    const exactTreeMatches = history.filter((commit) => commit.treeSha === templateTreeSha);
    if (exactTreeMatches.length > 1) return { status: "ambiguous" };
    const exactTreeMatch = exactTreeMatches[0];
    if (exactTreeMatch !== undefined && exactTreeMatches.length === 1)
      return {
        status: "recovered",
        studentDefaultBranchCommitSha: exactTreeMatch.commitSha
      };

    const templateManagedState = await this.getTreeState(
      this.options.templateDirectory,
      input.templateCommitSha
    );
    if (Object.keys(templateManagedState).length === 0) return { status: "not_found" };

    let matchingCommitSha: string | undefined;
    for (const commit of history) {
      const studentState = await this.getTreeState(this.options.studentDirectory, commit.commitSha);
      const matches = Object.entries(templateManagedState).every(
        ([path, state]) => studentState[path] === state
      );
      if (!matches) continue;
      if (matchingCommitSha !== undefined) return { status: "ambiguous" };
      matchingCommitSha = commit.commitSha;
    }
    return matchingCommitSha === undefined
      ? { status: "not_found" }
      : { status: "recovered", studentDefaultBranchCommitSha: matchingCommitSha };
  }

  async recoverTemplateAndStudentBaseline(
    input: RecoverTemplateAndStudentBaselineInput
  ): Promise<TemplateAndStudentBaselineRecoveryResult> {
    const [templateHistory, studentHistory] = await Promise.all([
      this.getFirstParentHistory(this.options.templateDirectory, input.currentTemplateCommitSha),
      this.getFirstParentHistory(
        this.options.studentDirectory,
        `refs/remotes/origin/${input.studentRepository.defaultBranch}`
      )
    ]);
    const studentCommitsByTree = new Map<string, string[]>();
    for (const studentCommit of studentHistory) {
      const commits = studentCommitsByTree.get(studentCommit.treeSha) ?? [];
      commits.push(studentCommit.commitSha);
      studentCommitsByTree.set(studentCommit.treeSha, commits);
    }

    const candidates = templateHistory.flatMap((templateCommit) =>
      (studentCommitsByTree.get(templateCommit.treeSha) ?? []).map(
        (studentDefaultBranchCommitSha) => ({
          templateCommitSha: templateCommit.commitSha,
          studentDefaultBranchCommitSha
        })
      )
    );
    if (candidates.length === 0) return { status: "not_found" };
    if (candidates.length > 1) return { status: "ambiguous" };
    const candidate = candidates[0];
    if (candidate === undefined) return { status: "not_found" };
    return { status: "recovered", ...candidate };
  }

  async applyAndPushTemplateDelta(
    input: ApplyTemplateDeltaInput
  ): Promise<ApplyTemplateDeltaResult> {
    await this.ensureCleanStudentWorktree();
    const originalHead = await this.getDefaultBranchCommitSha();
    try {
      const patch = await this.templatePatch(
        input.templateBaseCommitSha,
        input.templateTargetCommitSha
      );
      if (patch.length > 0) await this.applyThreeWayPatch(patch);
    } catch (error: unknown) {
      await this.abortAttemptSafely(originalHead);
      if (isGitConflict(error)) return { status: "conflict" };
      throw createTemplateSyncOperationError(
        "patch_failed",
        "Unable to apply the template changes to the student repository.",
        error
      );
    }

    try {
      await this.git(this.options.studentDirectory, [
        "commit",
        "--allow-empty",
        "-m",
        TEMPLATE_UPDATE_MESSAGE
      ]);
    } catch (error: unknown) {
      await this.abortAttemptSafely(originalHead);
      throw createTemplateSyncOperationError(
        "commit_failed",
        "Unable to commit the template update.",
        error
      );
    }

    const commitSha = await withFailureStage(
      "commit_failed",
      "Unable to read the template-update commit.",
      async () => await this.getDefaultBranchCommitSha()
    );
    try {
      await this.git(this.options.studentDirectory, [
        "push",
        "origin",
        `HEAD:${input.studentRepository.defaultBranch}`
      ]);
      return { status: "clean", commitSha };
    } catch (error: unknown) {
      await this.abortAttemptSafely(originalHead);
      throw createTemplateSyncOperationError(
        "push_failed",
        "Push to student repository was rejected.",
        error
      );
    }
  }

  async prepareConflictBranch(input: PrepareConflictBranchInput): Promise<void> {
    await this.ensureCleanStudentWorktree();

    let operationError: Error | undefined;
    try {
      await withFailureStage(
        "student_checkout_failed",
        "Unable to prepare the student repository baseline.",
        async () => {
          await this.git(this.options.studentDirectory, [
            "switch",
            "--detach",
            input.studentBaseCommitSha
          ]);
          await this.git(this.options.studentDirectory, ["switch", "-c", input.branchName]);
        }
      );
      const patch = await this.templatePatch(
        input.templateBaseCommitSha,
        input.templateTargetCommitSha
      );
      if (patch.length > 0)
        await withFailureStage(
          "patch_failed",
          "Unable to apply the template changes to the conflict branch.",
          () => this.applyThreeWayPatch(patch)
        );
      await withFailureStage(
        "commit_failed",
        "Unable to commit the template update.",
        async () =>
          await this.git(this.options.studentDirectory, [
            "commit",
            "--allow-empty",
            "-m",
            TEMPLATE_UPDATE_MESSAGE
          ])
      );
      await withFailureStage(
        "push_failed",
        "Push to student repository was rejected.",
        async () =>
          await this.git(this.options.studentDirectory, [
            "push",
            "origin",
            `HEAD:${input.branchName}`
          ])
      );
    } catch (error: unknown) {
      operationError = error instanceof Error ? error : new Error(String(error));
    }

    try {
      await this.restoreDefaultBranch(input.studentRepository.defaultBranch);
    } catch (error: unknown) {
      if (operationError === undefined) {
        operationError = createTemplateSyncOperationError(
          "student_checkout_failed",
          "Unable to restore the student default branch.",
          error
        );
      }
    }

    if (operationError !== undefined) throw operationError;
  }

  async deleteRemoteBranch(_repository: StudentRepositoryRef, branchName: string): Promise<void> {
    await withFailureStage(
      "push_failed",
      "Unable to delete the template-update branch.",
      async () =>
        this.git(this.options.studentDirectory, ["push", "origin", "--delete", branchName])
    );
    await this.git(this.options.studentDirectory, ["branch", "-D", branchName]);
  }

  private async ensureCleanStudentWorktree(): Promise<void> {
    const { stdout } = await this.git(this.options.studentDirectory, ["status", "--porcelain"]);
    if (stdout.length > 0) throw new Error("Student repository worktree is not clean.");
  }

  private async getTreeState(directory: string, commitSha: string): Promise<TemplateTree> {
    const { stdout } = await this.git(directory, ["ls-tree", "-r", "-z", commitSha]);
    return Object.fromEntries(
      stdout
        .split("\0")
        .filter((record) => record.length > 0)
        .map((record) => {
          const separator = record.indexOf("\t");
          return [record.slice(separator + 1), record.slice(0, separator)];
        })
    );
  }

  private async getFirstParentHistory(
    directory: string,
    revision: string
  ): Promise<{ commitSha: string; treeSha: string }[]> {
    const { stdout } = await this.git(directory, [
      "log",
      "--first-parent",
      "--format=%H %T",
      revision
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const separator = line.indexOf(" ");
        return { commitSha: line.slice(0, separator), treeSha: line.slice(separator + 1) };
      });
  }

  private async templatePatch(base: string, target: string): Promise<string> {
    return await withFailureStage(
      "patch_failed",
      "Unable to compute the template changes.",
      async () => {
        const { stdout } = await this.git(this.options.templateDirectory, [
          "diff",
          "--binary",
          base,
          target
        ]);
        return stdout;
      }
    );
  }

  private async applyThreeWayPatch(patch: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn(GIT, [
        "-C",
        this.options.studentDirectory,
        "apply",
        "--3way",
        "--index",
        "-"
      ]);
      let stderr = "";
      process.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      process.on("error", reject);
      process.on("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(stderr || `git apply exited with ${String(code ?? "an unknown")} status.`)
          );
      });
      process.stdin.end(patch);
    });
  }

  private async abortAttempt(originalHead: string): Promise<void> {
    await this.git(this.options.studentDirectory, ["reset", "--hard", originalHead]);
    await this.git(this.options.studentDirectory, ["clean", "-fd"]);
  }

  private async abortAttemptSafely(originalHead: string): Promise<void> {
    try {
      await this.abortAttempt(originalHead);
    } catch {
      // Cleanup must not replace the primary classified failure.
    }
  }

  private async restoreDefaultBranch(defaultBranch: string): Promise<void> {
    await this.git(this.options.studentDirectory, ["reset", "--hard"]);
    await this.git(this.options.studentDirectory, ["clean", "-fd"]);
    await this.git(this.options.studentDirectory, ["switch", defaultBranch]);
  }

  private async git(directory: string, args: string[]) {
    return execFile(GIT, ["-C", directory, ...args], { maxBuffer: MAX_GIT_COMMAND_OUTPUT_BYTES });
  }
}

const isGitConflict = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("patch does not apply") ||
    error.message.includes("with conflicts") ||
    error.message.includes("does not match index"));
