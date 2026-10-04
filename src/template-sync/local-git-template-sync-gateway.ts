import {
  createBranchName,
  createExactCommitRevision,
  createRemoteName,
  type GitAuthenticationContext,
  type GitTreeEntry,
  type GitWorkspacePreparer,
  type ObjectId
} from "../git/git-workspace.js";
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

const TEMPLATE_UPDATE_MESSAGE = "Apply template update";

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
  readonly templateWorkspace: GitWorkspacePreparer;
  readonly studentWorkspace: GitWorkspacePreparer;
  readonly authentication?: GitAuthenticationContext;
}

const requireOrigin = () => {
  const origin = createRemoteName("origin");
  if (origin === null) throw new Error("The origin remote name is invalid.");
  return origin;
};

const requireBranch = (value: string) => {
  const branch = createBranchName(value);
  if (branch === null) throw new Error("The Git branch name is invalid.");
  return branch;
};

const treeEntryState = (entry: GitTreeEntry): string =>
  `${entry.mode}\u0000${entry.objectType}\u0000${entry.objectId}`;

const treeState = (entries: readonly GitTreeEntry[]): ReadonlyMap<string, string> =>
  new Map(entries.map((entry) => [entry.path, treeEntryState(entry)]));

const isClean = (state: Awaited<ReturnType<GitWorkspacePreparer["inspect"]>>): boolean =>
  state.workingTree.trackedChanges.length === 0 &&
  state.workingTree.stagedChanges.length === 0 &&
  state.workingTree.untrackedPaths.length === 0 &&
  state.workingTree.conflicts.length === 0;

/** Template-domain policy implemented over two already-prepared semantic Git workspaces. */
export class LocalGitTemplateSyncGateway implements TemplateSyncGitGateway {
  constructor(private readonly options: LocalGitTemplateSyncGatewayOptions) {}

  async getTree(_repository: TemplateRepositoryRef, commitSha: string): Promise<TemplateTree> {
    const commit = await this.resolveCommit(this.options.templateWorkspace, commitSha);
    const entries = await this.options.templateWorkspace.listTree(commit);
    return Object.fromEntries(entries.map((entry) => [entry.path, entry.objectId]));
  }

  async getDefaultBranchCommitSha(): Promise<string> {
    return await this.options.studentWorkspace.resolveHead();
  }

  async recoverStudentBaseline(
    input: RecoverStudentBaselineInput
  ): Promise<TemplateSyncBaselineRecoveryResult> {
    const templateCommit = await this.resolveCommit(
      this.options.templateWorkspace,
      input.templateCommitSha
    );
    const studentHead = await this.options.studentWorkspace.resolveRemoteBranch(
      requireOrigin(),
      requireBranch(input.studentRepository.defaultBranch)
    );
    const [templateTree, history] = await Promise.all([
      this.options.templateWorkspace.resolveTree(templateCommit),
      this.options.studentWorkspace.listFirstParentCommitTrees(studentHead)
    ]);

    const exactTreeMatches = history.filter((commit) => commit.tree === templateTree);
    if (exactTreeMatches.length > 1) return { status: "ambiguous" };
    const exactTreeMatch = exactTreeMatches[0];
    if (exactTreeMatch !== undefined)
      return {
        status: "recovered",
        studentDefaultBranchCommitSha: exactTreeMatch.commit
      };

    const templateManagedState = treeState(
      await this.options.templateWorkspace.listTree(templateCommit)
    );
    if (templateManagedState.size === 0) return { status: "not_found" };

    let matchingCommit: ObjectId | undefined;
    for (const commit of history) {
      const studentState = treeState(await this.options.studentWorkspace.listTree(commit.commit));
      const matches = [...templateManagedState.entries()].every(
        ([path, state]) => studentState.get(path) === state
      );
      if (matches && matchingCommit !== undefined) return { status: "ambiguous" };
      if (matches) matchingCommit = commit.commit;
    }
    return matchingCommit === undefined
      ? { status: "not_found" }
      : { status: "recovered", studentDefaultBranchCommitSha: matchingCommit };
  }

  async recoverTemplateAndStudentBaseline(
    input: RecoverTemplateAndStudentBaselineInput
  ): Promise<TemplateAndStudentBaselineRecoveryResult> {
    const templateHead = await this.resolveCommit(
      this.options.templateWorkspace,
      input.currentTemplateCommitSha
    );
    const studentHead = await this.options.studentWorkspace.resolveRemoteBranch(
      requireOrigin(),
      requireBranch(input.studentRepository.defaultBranch)
    );
    const [templateHistory, studentHistory] = await Promise.all([
      this.options.templateWorkspace.listFirstParentCommitTrees(templateHead),
      this.options.studentWorkspace.listFirstParentCommitTrees(studentHead)
    ]);
    const studentCommitsByTree = new Map<string, ObjectId[]>();
    for (const studentCommit of studentHistory) {
      const commits = studentCommitsByTree.get(studentCommit.tree) ?? [];
      commits.push(studentCommit.commit);
      studentCommitsByTree.set(studentCommit.tree, commits);
    }

    const candidates = templateHistory.flatMap((templateCommit) =>
      (studentCommitsByTree.get(templateCommit.tree) ?? []).map(
        (studentDefaultBranchCommitSha) => ({
          templateCommitSha: templateCommit.commit,
          studentDefaultBranchCommitSha
        })
      )
    );
    if (candidates.length === 0) return { status: "not_found" };
    if (candidates.length > 1) return { status: "ambiguous" };
    const candidate = candidates[0];
    return candidate === undefined
      ? { status: "not_found" }
      : { status: "recovered", ...candidate };
  }

  async applyAndPushTemplateDelta(
    input: ApplyTemplateDeltaInput
  ): Promise<ApplyTemplateDeltaResult> {
    await this.ensureCleanStudentWorktree();
    const originalHead = await this.options.studentWorkspace.resolveHead();
    try {
      const [base, target] = await Promise.all([
        this.resolveCommit(this.options.templateWorkspace, input.templateBaseCommitSha),
        this.resolveCommit(this.options.templateWorkspace, input.templateTargetCommitSha),
        this.resolveCommit(this.options.studentWorkspace, input.studentBaseCommitSha),
        this.resolveCommit(this.options.studentWorkspace, input.studentCurrentCommitSha)
      ]);
      const patch = await this.options.templateWorkspace.diff({ base, target });
      if (patch.patch.length > 0) {
        const applied = await this.options.studentWorkspace.applyPatchToIndex({
          patch: patch.patch
        });
        if (applied.kind === "conflict") {
          await this.abortAttemptSafely(originalHead);
          return { status: "conflict" };
        }
      }
    } catch (error: unknown) {
      await this.abortAttemptSafely(originalHead);
      throw createTemplateSyncOperationError(
        "patch_failed",
        "Unable to apply the template changes to the student repository.",
        error
      );
    }

    let commitSha: ObjectId;
    try {
      commitSha = await this.options.studentWorkspace.commit({
        message: TEMPLATE_UPDATE_MESSAGE,
        allowEmpty: true
      });
    } catch (error: unknown) {
      await this.abortAttemptSafely(originalHead);
      throw createTemplateSyncOperationError(
        "commit_failed",
        "Unable to commit the template update.",
        error
      );
    }

    try {
      await this.options.studentWorkspace.pushBranch({
        remote: requireOrigin(),
        branch: requireBranch(input.studentRepository.defaultBranch),
        ...(this.options.authentication === undefined
          ? {}
          : { authentication: this.options.authentication })
      });
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
    const originalHead = await this.options.studentWorkspace.resolveHead();
    let restoreHead = originalHead;
    let operationError: Error | undefined;
    try {
      await withFailureStage(
        "student_checkout_failed",
        "Unable to prepare the student repository baseline.",
        async () => {
          const studentBase = await this.resolveCommit(
            this.options.studentWorkspace,
            input.studentBaseCommitSha
          );
          await this.resolveCommit(this.options.studentWorkspace, input.studentCurrentCommitSha);
          await this.options.studentWorkspace.checkoutDetached(this.exactRevision(studentBase));
          restoreHead = studentBase;
          await this.options.studentWorkspace.createBranch(requireBranch(input.branchName));
        }
      );
      await withFailureStage(
        "patch_failed",
        "Unable to apply the template changes to the conflict branch.",
        async () => {
          const [base, target] = await Promise.all([
            this.resolveCommit(this.options.templateWorkspace, input.templateBaseCommitSha),
            this.resolveCommit(this.options.templateWorkspace, input.templateTargetCommitSha)
          ]);
          const patch = await this.options.templateWorkspace.diff({ base, target });
          if (patch.patch.length > 0) {
            const applied = await this.options.studentWorkspace.applyPatchToIndex({
              patch: patch.patch
            });
            if (applied.kind === "conflict")
              throw new Error("The template patch conflicted with its recorded baseline.");
          }
        }
      );
      restoreHead = await withFailureStage(
        "commit_failed",
        "Unable to commit the template update.",
        async () =>
          await this.options.studentWorkspace.commit({
            message: TEMPLATE_UPDATE_MESSAGE,
            allowEmpty: true
          })
      );
      await withFailureStage(
        "push_failed",
        "Push to student repository was rejected.",
        async () =>
          await this.options.studentWorkspace.pushBranch({
            remote: requireOrigin(),
            branch: requireBranch(input.branchName),
            ...(this.options.authentication === undefined
              ? {}
              : { authentication: this.options.authentication })
          })
      );
    } catch (error: unknown) {
      operationError = error instanceof Error ? error : new Error(String(error));
    }

    try {
      await this.options.studentWorkspace.restoreDisposableAttempt({
        expectedHead: restoreHead,
        removeUntracked: true
      });
      await this.options.studentWorkspace.switchBranch(
        requireBranch(input.studentRepository.defaultBranch)
      );
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
    const branch = requireBranch(branchName);
    await withFailureStage(
      "push_failed",
      "Unable to delete the template-update branch.",
      async () => {
        await this.options.studentWorkspace.deleteRemoteBranch({
          remote: requireOrigin(),
          branch,
          ...(this.options.authentication === undefined
            ? {}
            : { authentication: this.options.authentication })
        });
      }
    );
    await this.options.studentWorkspace.deleteLocalBranch({ branch, force: true });
  }

  private async ensureCleanStudentWorktree(): Promise<void> {
    if (!isClean(await this.options.studentWorkspace.inspect()))
      throw new Error("Student repository worktree is not clean.");
  }

  private async resolveCommit(workspace: GitWorkspacePreparer, value: string): Promise<ObjectId> {
    const revision = createExactCommitRevision(value);
    if (revision === null) throw new Error("The Git commit identifier is invalid.");
    return await workspace.resolveRevision(revision);
  }

  private exactRevision(commit: ObjectId) {
    const revision = createExactCommitRevision(commit);
    if (revision === null) throw new Error("The Git commit identifier is invalid.");
    return revision;
  }

  private async abortAttemptSafely(originalHead: ObjectId): Promise<void> {
    try {
      await this.options.studentWorkspace.restoreDisposableAttempt({
        expectedHead: originalHead,
        removeUntracked: true
      });
    } catch {
      // Cleanup must not replace the primary classified failure.
    }
  }
}
