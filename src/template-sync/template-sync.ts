import { getTemplateSyncFailure, type TemplateSyncFailure } from "./template-sync-failure.js";

/** A file tree keyed by repository-relative POSIX path. Blob identifiers are opaque to this layer. */
export type TemplateTree = Readonly<Record<string, string>>;

export interface TemplateRepositoryRef {
  owner: string;
  name: string;
}

export interface StudentRepositoryRef extends TemplateRepositoryRef {
  defaultBranch: string;
}

export interface TemplateSyncAnchors {
  templateCommitSha?: string;
  studentDefaultBranchCommitSha?: string;
  templateSyncBaselineStatus: "initialized" | "baseline_required";
}

/** A baseline that has both commit identities and can safely drive a three-way update. */
export interface InitializedTemplateSyncAnchors extends TemplateSyncAnchors {
  templateCommitSha: string;
  studentDefaultBranchCommitSha: string;
  templateSyncBaselineStatus: "initialized";
}

export type TemplateFileChange =
  | { path: string; status: "added"; after: string }
  | { path: string; status: "deleted"; before: string }
  | { path: string; status: "modified"; before: string; after: string };

export interface ApplyTemplateDeltaInput {
  templateRepository: TemplateRepositoryRef;
  studentRepository: StudentRepositoryRef;
  /** The template-side merge base, never the student's whole repository tree. */
  templateBaseCommitSha: string;
  templateTargetCommitSha: string;
  /** The student-side baseline is provided for a proper three-way Git application. */
  studentBaseCommitSha: string;
  studentCurrentCommitSha: string;
  changes: readonly TemplateFileChange[];
}

export type ApplyTemplateDeltaResult =
  | { status: "clean"; commitSha: string }
  | { status: "conflict" };

export interface PrepareConflictBranchInput extends ApplyTemplateDeltaInput {
  branchName: string;
}

export interface RecoverStudentBaselineInput {
  templateRepository: TemplateRepositoryRef;
  studentRepository: StudentRepositoryRef;
  templateCommitSha: string;
}

export interface RecoverTemplateAndStudentBaselineInput {
  templateRepository: TemplateRepositoryRef;
  studentRepository: StudentRepositoryRef;
  currentTemplateCommitSha: string;
}

export type TemplateSyncBaselineRecoveryResult =
  | { status: "recovered"; studentDefaultBranchCommitSha: string }
  | { status: "not_found" }
  | { status: "ambiguous" };

export type TemplateAndStudentBaselineRecoveryResult =
  | {
      status: "recovered";
      templateCommitSha: string;
      studentDefaultBranchCommitSha: string;
    }
  | { status: "not_found" }
  | { status: "ambiguous" };

export interface TemplatePullRequest {
  number: number;
  url: string;
}

export interface TemplatePullRequestRecord extends TemplatePullRequest {
  state: "open" | "closed";
  merged: boolean;
}

export interface TemplateSyncPullRequestGateway {
  createPullRequest(input: {
    repository: StudentRepositoryRef;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
  }): Promise<TemplatePullRequest>;
  findPullRequest(input: {
    repository: StudentRepositoryRef;
    sourceBranch: string;
    targetBranch: string;
  }): Promise<TemplatePullRequestRecord | null>;
}

/**
 * The infrastructure boundary for this operation. Its implementation must use
 * Git's three-way merge/apply machinery, create one ordinary commit on the
 * default branch, and push with force disabled. On conflict it must abort its
 * worktree/index before returning.
 */
export interface TemplateSyncGitGateway {
  getTree(repository: TemplateRepositoryRef, commitSha: string): Promise<TemplateTree>;
  getDefaultBranchCommitSha(repository: StudentRepositoryRef): Promise<string>;
  recoverStudentBaseline(
    input: RecoverStudentBaselineInput
  ): Promise<TemplateSyncBaselineRecoveryResult>;
  recoverTemplateAndStudentBaseline(
    input: RecoverTemplateAndStudentBaselineInput
  ): Promise<TemplateAndStudentBaselineRecoveryResult>;
  applyAndPushTemplateDelta(input: ApplyTemplateDeltaInput): Promise<ApplyTemplateDeltaResult>;
  /** Creates and non-force pushes a branch from studentBaseCommitSha, never main. */
  prepareConflictBranch(input: PrepareConflictBranchInput): Promise<void>;
  deleteRemoteBranch(repository: StudentRepositoryRef, branchName: string): Promise<void>;
}

export interface TemplateSyncInput {
  templateRepository: TemplateRepositoryRef;
  studentRepository: StudentRepositoryRef;
  currentTemplateCommitSha: string;
  anchors: TemplateSyncAnchors;
  gateway: TemplateSyncGitGateway;
  pullRequests: TemplateSyncPullRequestGateway;
  /** Persists anchors after reliable recovery or a confirmed non-force push. */
  updateAnchors(anchors: InitializedTemplateSyncAnchors): Promise<void>;
}

export interface TemplateSyncBaselineRequiredResult {
  status: "baseline_required";
  reason?: "no_reliable_match" | "ambiguous_matches";
  message?: string;
}

export type TemplateSyncResult =
  | { status: "updated"; commitSha: string }
  | { status: "already_current" }
  | TemplateSyncBaselineRequiredResult
  | { status: "conflict" }
  | {
      status: "pull_request_created";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
    }
  | {
      status: "pull_request_pending";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
    }
  | {
      status: "pull_request_reconciled";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
      branchCleanup: "deleted" | "failed";
      cleanupError?: unknown;
    }
  | {
      status: "pull_request_closed";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
      branchCleanup: "deleted" | "failed";
      cleanupError?: unknown;
    }
  | { status: "failure"; error: unknown; failure?: TemplateSyncFailure };

export type TemplateSyncReconciliationResult =
  | { status: "already_current" }
  | { status: "baseline_required" }
  | {
      status: "pull_request_pending";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
    }
  | {
      status: "pull_request_reconciled";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
      branchCleanup: "deleted" | "failed";
      cleanupError?: unknown;
    }
  | {
      status: "pull_request_closed";
      pullRequest: TemplatePullRequest;
      branchName: string;
      templateCommitSha: string;
      branchCleanup: "deleted" | "failed";
      cleanupError?: unknown;
    }
  | { status: "not_found" }
  | { status: "failure"; error: unknown; failure?: TemplateSyncFailure };

const TEMPLATE_UPDATE_BRANCH_PREFIX = "graider/template-update-";
const TEMPLATE_UPDATE_BRANCH_SHA_PREFIX_LENGTH = 12;
const TEMPLATE_UPDATE_TITLE = "Template update";
const TEMPLATE_UPDATE_BODY =
  "Graider could not merge this faculty template update automatically. Please resolve the conflicts and merge this pull request.";

export const createTemplateUpdateBranchName = (templateCommitSha: string): string =>
  `${TEMPLATE_UPDATE_BRANCH_PREFIX}${templateCommitSha.slice(0, TEMPLATE_UPDATE_BRANCH_SHA_PREFIX_LENGTH)}`;

const hasInitializedAnchors = (
  anchors: TemplateSyncAnchors
): anchors is InitializedTemplateSyncAnchors =>
  anchors.templateSyncBaselineStatus === "initialized" &&
  anchors.templateCommitSha !== undefined &&
  anchors.studentDefaultBranchCommitSha !== undefined;

export const computeTemplateDelta = (
  base: TemplateTree,
  target: TemplateTree
): TemplateFileChange[] => {
  const paths = new Set([...Object.keys(base), ...Object.keys(target)]);

  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((path): TemplateFileChange[] => {
      const before = base[path];
      const after = target[path];
      if (before === after) return [];
      if (before === undefined && after !== undefined) return [{ path, status: "added", after }];
      if (before !== undefined && after === undefined) return [{ path, status: "deleted", before }];
      if (before !== undefined && after !== undefined)
        return [{ path, status: "modified", before, after }];
      return [];
    });
};

export const syncTemplateUpdate = async (input: TemplateSyncInput): Promise<TemplateSyncResult> => {
  let anchors = input.anchors;
  if (!hasInitializedAnchors(anchors)) {
    const recoveredAnchors = await recoverLegacyTemplateSyncAnchors(input);
    if ("status" in recoveredAnchors) return recoveredAnchors;
    try {
      await input.updateAnchors(recoveredAnchors);
    } catch (error: unknown) {
      const failure = getTemplateSyncFailure(error);
      return { status: "failure", error, ...(failure === undefined ? {} : { failure }) };
    }
    anchors = recoveredAnchors;
  }

  if (!hasInitializedAnchors(anchors)) return { status: "baseline_required" };
  const initializedAnchors = anchors;
  const syncInput: TemplateSyncInput = { ...input, anchors: initializedAnchors };
  if (initializedAnchors.templateCommitSha === syncInput.currentTemplateCommitSha) {
    return { status: "already_current" };
  }

  const reconciliation = await reconcileTemplateUpdatePullRequest(syncInput);
  if (reconciliation.status !== "not_found") return reconciliation;

  try {
    const [baseTree, targetTree, studentCurrentCommitSha] = await Promise.all([
      syncInput.gateway.getTree(syncInput.templateRepository, initializedAnchors.templateCommitSha),
      syncInput.gateway.getTree(syncInput.templateRepository, syncInput.currentTemplateCommitSha),
      syncInput.gateway.getDefaultBranchCommitSha(syncInput.studentRepository)
    ]);
    const changes = computeTemplateDelta(baseTree, targetTree);
    const applied = await syncInput.gateway.applyAndPushTemplateDelta({
      templateRepository: syncInput.templateRepository,
      studentRepository: syncInput.studentRepository,
      templateBaseCommitSha: initializedAnchors.templateCommitSha,
      templateTargetCommitSha: syncInput.currentTemplateCommitSha,
      studentBaseCommitSha: initializedAnchors.studentDefaultBranchCommitSha,
      studentCurrentCommitSha,
      changes
    });

    if (applied.status === "conflict") {
      const branchName = createTemplateUpdateBranchName(syncInput.currentTemplateCommitSha);
      await syncInput.gateway.prepareConflictBranch({
        templateRepository: syncInput.templateRepository,
        studentRepository: syncInput.studentRepository,
        templateBaseCommitSha: initializedAnchors.templateCommitSha,
        templateTargetCommitSha: syncInput.currentTemplateCommitSha,
        studentBaseCommitSha: initializedAnchors.studentDefaultBranchCommitSha,
        studentCurrentCommitSha,
        changes,
        branchName
      });
      const pullRequest = await syncInput.pullRequests.createPullRequest({
        repository: syncInput.studentRepository,
        sourceBranch: branchName,
        targetBranch: syncInput.studentRepository.defaultBranch,
        title: TEMPLATE_UPDATE_TITLE,
        body: TEMPLATE_UPDATE_BODY
      });
      return {
        status: "pull_request_created",
        pullRequest,
        branchName,
        templateCommitSha: syncInput.currentTemplateCommitSha
      };
    }

    await syncInput.updateAnchors({
      templateCommitSha: syncInput.currentTemplateCommitSha,
      studentDefaultBranchCommitSha: applied.commitSha,
      templateSyncBaselineStatus: "initialized"
    });
    return { status: "updated", commitSha: applied.commitSha };
  } catch (error: unknown) {
    const failure = getTemplateSyncFailure(error);
    return { status: "failure", error, ...(failure === undefined ? {} : { failure }) };
  }
};

const recoverLegacyTemplateSyncAnchors = async (
  input: TemplateSyncInput
): Promise<
  InitializedTemplateSyncAnchors | TemplateSyncBaselineRequiredResult | TemplateSyncResult
> => {
  const anchors = input.anchors;
  if (anchors.templateSyncBaselineStatus !== "baseline_required")
    return { status: "baseline_required" };
  if (
    (anchors.templateCommitSha === undefined &&
      anchors.studentDefaultBranchCommitSha !== undefined) ||
    (anchors.templateCommitSha !== undefined && anchors.studentDefaultBranchCommitSha !== undefined)
  )
    return { status: "baseline_required" };

  try {
    if (anchors.templateCommitSha !== undefined) {
      const recovery = await input.gateway.recoverStudentBaseline({
        templateRepository: input.templateRepository,
        studentRepository: input.studentRepository,
        templateCommitSha: anchors.templateCommitSha
      });
      if (recovery.status === "not_found")
        return {
          status: "baseline_required",
          reason: "no_reliable_match",
          message:
            "No student history commit exactly matches the recorded template revision. Initialize the synchronization baseline manually."
        };
      if (recovery.status === "ambiguous")
        return {
          status: "baseline_required",
          reason: "ambiguous_matches",
          message:
            "Multiple student history commits match the recorded template revision. Initialize the synchronization baseline manually."
        };
      return {
        templateCommitSha: anchors.templateCommitSha,
        studentDefaultBranchCommitSha: recovery.studentDefaultBranchCommitSha,
        templateSyncBaselineStatus: "initialized"
      };
    }

    const recovery = await input.gateway.recoverTemplateAndStudentBaseline({
      templateRepository: input.templateRepository,
      studentRepository: input.studentRepository,
      currentTemplateCommitSha: input.currentTemplateCommitSha
    });
    if (recovery.status === "not_found")
      return {
        status: "baseline_required",
        reason: "no_reliable_match",
        message:
          "No exact historical template/student tree match could be established safely. Initialize the synchronization baseline manually."
      };
    if (recovery.status === "ambiguous")
      return {
        status: "baseline_required",
        reason: "ambiguous_matches",
        message:
          "Multiple exact historical template/student tree matches exist, so the synchronization baseline cannot be chosen automatically."
      };
    return {
      templateCommitSha: recovery.templateCommitSha,
      studentDefaultBranchCommitSha: recovery.studentDefaultBranchCommitSha,
      templateSyncBaselineStatus: "initialized"
    };
  } catch (error: unknown) {
    const failure = getTemplateSyncFailure(error);
    return { status: "failure", error, ...(failure === undefined ? {} : { failure }) };
  }
};

const cleanupTemplateUpdateBranch = async (
  input: TemplateSyncInput,
  branchName: string
): Promise<{ branchCleanup: "deleted" | "failed"; cleanupError?: unknown }> => {
  try {
    await input.gateway.deleteRemoteBranch(input.studentRepository, branchName);
    return { branchCleanup: "deleted" };
  } catch (cleanupError: unknown) {
    return { branchCleanup: "failed", cleanupError };
  }
};

/** Reconciles only the deterministic Graider PR for the supplied template revision. */
export const reconcileTemplateUpdatePullRequest = async (
  input: TemplateSyncInput
): Promise<TemplateSyncReconciliationResult> => {
  if (!hasInitializedAnchors(input.anchors)) return { status: "baseline_required" };
  if (input.anchors.templateCommitSha === input.currentTemplateCommitSha) {
    return { status: "already_current" };
  }

  const branchName = createTemplateUpdateBranchName(input.currentTemplateCommitSha);
  try {
    const pullRequest = await input.pullRequests.findPullRequest({
      repository: input.studentRepository,
      sourceBranch: branchName,
      targetBranch: input.studentRepository.defaultBranch
    });
    if (pullRequest === null) return { status: "not_found" };
    if (pullRequest.state === "open") {
      return {
        status: "pull_request_pending",
        pullRequest: { number: pullRequest.number, url: pullRequest.url },
        branchName,
        templateCommitSha: input.currentTemplateCommitSha
      };
    }

    if (!pullRequest.merged) {
      return {
        status: "pull_request_closed",
        pullRequest: { number: pullRequest.number, url: pullRequest.url },
        branchName,
        templateCommitSha: input.currentTemplateCommitSha,
        ...(await cleanupTemplateUpdateBranch(input, branchName))
      };
    }

    const studentDefaultBranchCommitSha = await input.gateway.getDefaultBranchCommitSha(
      input.studentRepository
    );
    await input.updateAnchors({
      templateCommitSha: input.currentTemplateCommitSha,
      studentDefaultBranchCommitSha,
      templateSyncBaselineStatus: "initialized"
    });
    return {
      status: "pull_request_reconciled",
      pullRequest: { number: pullRequest.number, url: pullRequest.url },
      branchName,
      templateCommitSha: input.currentTemplateCommitSha,
      ...(await cleanupTemplateUpdateBranch(input, branchName))
    };
  } catch (error: unknown) {
    const failure = getTemplateSyncFailure(error);
    return { status: "failure", error, ...(failure === undefined ? {} : { failure }) };
  }
};
