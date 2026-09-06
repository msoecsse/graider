import { execFile as executeFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type {
  ApplyTemplateDeltaInput,
  ApplyTemplateDeltaResult,
  PrepareConflictBranchInput,
  StudentRepositoryRef,
  TemplateRepositoryRef,
  TemplateSyncGitGateway,
  TemplateTree
} from "./template-sync.js";

const execFile = promisify(executeFile);
const GIT = "git";
const TEMPLATE_UPDATE_MESSAGE = "Apply template update";

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

  async getDefaultBranchCommitSha(_repository: StudentRepositoryRef): Promise<string> {
    const { stdout } = await this.git(this.options.studentDirectory, ["rev-parse", "HEAD"]);
    return stdout.trim();
  }

  async applyAndPushTemplateDelta(
    input: ApplyTemplateDeltaInput
  ): Promise<ApplyTemplateDeltaResult> {
    await this.ensureCleanStudentWorktree();
    const originalHead = await this.getDefaultBranchCommitSha(input.studentRepository);
    try {
      const patch = await this.templatePatch(
        input.templateBaseCommitSha,
        input.templateTargetCommitSha
      );
      if (patch.length > 0) await this.applyThreeWayPatch(patch);
    } catch (error: unknown) {
      await this.abortAttempt(originalHead);
      if (isGitConflict(error)) return { status: "conflict" };
      throw error;
    }

    try {
      await this.git(this.options.studentDirectory, [
        "commit",
        "--allow-empty",
        "-m",
        TEMPLATE_UPDATE_MESSAGE
      ]);
      const commitSha = await this.getDefaultBranchCommitSha(input.studentRepository);
      await this.git(this.options.studentDirectory, [
        "push",
        "origin",
        `HEAD:${input.studentRepository.defaultBranch}`
      ]);
      return { status: "clean", commitSha };
    } catch (error: unknown) {
      await this.abortAttempt(originalHead);
      throw error;
    }
  }

  async prepareConflictBranch(input: PrepareConflictBranchInput): Promise<void> {
    await this.ensureCleanStudentWorktree();

    try {
      await this.git(this.options.studentDirectory, [
        "switch",
        "--detach",
        input.studentBaseCommitSha
      ]);
      await this.git(this.options.studentDirectory, ["switch", "-c", input.branchName]);
      const patch = await this.templatePatch(
        input.templateBaseCommitSha,
        input.templateTargetCommitSha
      );
      if (patch.length > 0) await this.applyThreeWayPatch(patch);
      await this.git(this.options.studentDirectory, [
        "commit",
        "--allow-empty",
        "-m",
        TEMPLATE_UPDATE_MESSAGE
      ]);
      await this.git(this.options.studentDirectory, ["push", "origin", `HEAD:${input.branchName}`]);
    } finally {
      await this.restoreDefaultBranch(input.studentRepository.defaultBranch);
    }
  }

  async deleteRemoteBranch(_repository: StudentRepositoryRef, branchName: string): Promise<void> {
    await this.git(this.options.studentDirectory, ["push", "origin", "--delete", branchName]);
    await this.git(this.options.studentDirectory, ["branch", "-D", branchName]);
  }

  private async ensureCleanStudentWorktree(): Promise<void> {
    const { stdout } = await this.git(this.options.studentDirectory, ["status", "--porcelain"]);
    if (stdout.length > 0) throw new Error("Student repository worktree is not clean.");
  }

  private async templatePatch(base: string, target: string): Promise<string> {
    const { stdout } = await this.git(this.options.templateDirectory, [
      "diff",
      "--binary",
      base,
      target
    ]);
    return stdout;
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
        else reject(new Error(stderr || `git apply exited with ${code ?? "an unknown"} status.`));
      });
      process.stdin.end(patch);
    });
  }

  private async abortAttempt(originalHead: string): Promise<void> {
    await this.git(this.options.studentDirectory, ["reset", "--hard", originalHead]);
    await this.git(this.options.studentDirectory, ["clean", "-fd"]);
  }

  private async restoreDefaultBranch(defaultBranch: string): Promise<void> {
    await this.git(this.options.studentDirectory, ["reset", "--hard"]);
    await this.git(this.options.studentDirectory, ["clean", "-fd"]);
    await this.git(this.options.studentDirectory, ["switch", defaultBranch]);
  }

  private async git(directory: string, args: string[]) {
    return execFile(GIT, ["-C", directory, ...args], { maxBuffer: 10 * 1024 * 1024 });
  }
}

const isGitConflict = (error: unknown): boolean =>
  error instanceof Error &&
  (error.message.includes("patch does not apply") ||
    error.message.includes("with conflicts") ||
    error.message.includes("does not match index"));
