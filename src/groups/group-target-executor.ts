import type { LoadedGraiderConfig } from "../config/config-models.js";
import { DiagnosticCode, createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import type { GitHubRepository } from "../github/github-models.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import { getEffectiveAssignmentGrading } from "../config/effective-grading.js";
import { getWorkflowDispatchIdentifier } from "../workflows/workflow-paths.js";
import {
  WorkflowDeploymentPermissionError,
  ensureManagedGradingWorkflow,
  isManagedGradingWorkflowEligible
} from "../workflows/managed-workflow-deployment.js";
import { GRAIDER_MANAGED_WORKFLOW_PATH } from "../workflows/managed-workflow-policy.js";
import type { GroupApplyPreviewTarget } from "./group-preview-planner.js";
import {
  reportApplyRepositoryProgress,
  type ApplyRepositoryProgressObserver
} from "../execution/apply-progress.js";

const FIRST_REPOSITORY_POSITION = 1;

export interface GroupTargetExecutionResult {
  readonly targets: readonly GroupTargetExecutionTargetResult[];
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
}
export interface GroupTargetExecutionTargetResult {
  readonly target: GroupApplyPreviewTarget;
  readonly htmlUrl: string | null;
  readonly cloneUrl: string | null;
  readonly status: "created" | "updated" | "failed";
  readonly diagnostics: readonly Diagnostic[];
}

export type GroupRepositoryObservedHandler = (
  result: GroupTargetExecutionTargetResult
) => Promise<readonly Diagnostic[]> | readonly Diagnostic[];

const failure = (
  target: GroupApplyPreviewTarget,
  message: string,
  code: string = "group_target_execution_failed"
): Diagnostic =>
  createConfigDiagnostic(code, message, {
    groupId: target.groupId,
    repositoryName: target.repositoryName
  });

/** Fail-fast executor. Repository observations can be durably checkpointed by the caller. */
export const executeGroupTargets = async (input: {
  config: LoadedGraiderConfig;
  targets: readonly GroupApplyPreviewTarget[];
  githubClient: GitHubClient;
  trackedTargetIds?: ReadonlySet<string>;
  onRepositoryObserved?: GroupRepositoryObservedHandler;
  onRepositoryProgress?: ApplyRepositoryProgressObserver;
}): Promise<GroupTargetExecutionResult> => {
  const results: GroupTargetExecutionTargetResult[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];
  const assignmentTemplate = input.config.assignment.template;
  const template = assignmentTemplate
    ? parseTemplateRepository(
        input.config.course.github.organization,
        assignmentTemplate.repository
      )
    : undefined;
  const grading = getEffectiveAssignmentGrading(input.config);
  const deployManagedWorkflow = isManagedGradingWorkflowEligible(grading);
  if (template?.status === "failure")
    return { targets: results, warnings, errors: [template.diagnostic] };
  for (const [index, target] of input.targets.entries()) {
    reportApplyRepositoryProgress(input.onRepositoryProgress, {
      current: index + FIRST_REPOSITORY_POSITION,
      total: input.targets.length,
      repository: `${input.config.course.github.organization}/${target.repositoryName}`,
      mode: "group",
      groupId: target.groupId
    });
    let repository: GitHubRepository | null = null;
    let repositoryCreated = false;
    try {
      const existing = await input.githubClient.getRepository(
        input.config.course.github.organization,
        target.repositoryName
      );
      const isTracked = input.trackedTargetIds?.has(target.targetId) === true;
      if (existing !== null && !isTracked) {
        const diagnostic = failure(
          target,
          `Repository ${target.repositoryName} already exists and is not manifest-tracked. Graider will not adopt untracked repositories automatically.`
        );
        return {
          targets: [
            ...results,
            { target, htmlUrl: null, cloneUrl: null, status: "failed", diagnostics: [diagnostic] }
          ],
          warnings,
          errors: [...errors, diagnostic]
        };
      }
      if (existing === null && isTracked) {
        const diagnostic = failure(
          target,
          `Manifest-tracked repository ${target.repositoryName} was not found on GitHub.`,
          DiagnosticCode.ManifestTrackedRepositoryMissing
        );
        return {
          targets: [
            ...results,
            { target, htmlUrl: null, cloneUrl: null, status: "failed", diagnostics: [diagnostic] }
          ],
          warnings,
          errors: [...errors, diagnostic]
        };
      }
      if (existing === null && template?.status === "success") {
        await input.githubClient.createRepositoryFromTemplate({
          templateOwner: template.repository.owner,
          templateRepo: template.repository.repo,
          owner: input.config.course.github.organization,
          name: target.repositoryName,
          private: true
        });
        repositoryCreated = true;
      } else if (existing === null) {
        await input.githubClient.createRepository({
          owner: input.config.course.github.organization,
          name: target.repositoryName,
          private: true
        });
        repositoryCreated = true;
      }
      repository =
        existing ??
        (await input.githubClient.getRepository(
          input.config.course.github.organization,
          target.repositoryName
        ));
      if (repository === null) throw new Error("Repository creation was not observable.");
      const observedResult: GroupTargetExecutionTargetResult = {
        target,
        htmlUrl: repository.htmlUrl,
        cloneUrl: `${repository.htmlUrl}.git`,
        status: repositoryCreated ? "created" : "updated",
        diagnostics: []
      };
      if (repositoryCreated && input.onRepositoryObserved !== undefined) {
        const persistenceDiagnostics = await input.onRepositoryObserved(observedResult);
        if (persistenceDiagnostics.length > 0) {
          return {
            targets: [
              ...results,
              { ...observedResult, status: "failed", diagnostics: persistenceDiagnostics }
            ],
            warnings,
            errors: [...errors, ...persistenceDiagnostics]
          };
        }
      }
      for (const username of new Set(target.githubUsernames))
        await input.githubClient.addCollaborator({
          owner: repository.owner,
          repo: repository.name,
          username,
          permission: "admin"
        });
      await input.githubClient.addTeamPermission({
        owner: repository.owner,
        repo: repository.name,
        teamSlug: target.facultyTeam,
        permission: target.facultyTeamPermission as never
      });
      if (target.graderTeam !== undefined && target.graderTeamPermission !== undefined) {
        await input.githubClient.addTeamPermission({
          owner: repository.owner,
          repo: repository.name,
          teamSlug: target.graderTeam,
          permission: target.graderTeamPermission as never
        });
      }
      const actionsState = await input.githubClient.getActionsState(
        repository.owner,
        repository.name
      );
      if (actionsState !== "enabled") {
        await input.githubClient.enableActions(repository.owner, repository.name);
      }
      if (deployManagedWorkflow) {
        const deployment = await ensureManagedGradingWorkflow({
          githubClient: input.githubClient,
          owner: repository.owner,
          repo: repository.name,
          defaultBranch: repository.defaultBranch,
          grading
        });
        if (
          deployment.status === "conflict_unmanaged" ||
          deployment.status === "conflict_unsupported_version"
        ) {
          const diagnostic = failure(
            target,
            deployment.status === "conflict_unmanaged"
              ? `Repository ${target.repositoryName} contains an existing ${GRAIDER_MANAGED_WORKFLOW_PATH} that is not managed by Graider; it was preserved.`
              : `Repository ${target.repositoryName} contains a Graider workflow with an unsupported ownership version; it was preserved.`,
            deployment.status === "conflict_unmanaged"
              ? DiagnosticCode.WorkflowDeploymentConflict
              : DiagnosticCode.WorkflowDeploymentVersionUnsupported
          );
          return {
            targets: [
              ...results,
              {
                target,
                htmlUrl: repository.htmlUrl,
                cloneUrl: `${repository.htmlUrl}.git`,
                status: "failed",
                diagnostics: [diagnostic]
              }
            ],
            warnings,
            errors: [...errors, diagnostic]
          };
        }
      }
      const workflowPath = deployManagedWorkflow ? GRAIDER_MANAGED_WORKFLOW_PATH : grading.workflow;
      if (grading.enabled && workflowPath !== undefined)
        await input.githubClient.getWorkflow(
          repository.owner,
          repository.name,
          getWorkflowDispatchIdentifier(workflowPath)
        );
      results.push(observedResult);
    } catch (error: unknown) {
      const diagnostic = failure(
        target,
        error instanceof WorkflowDeploymentPermissionError
          ? `Graider could not create or update ${GRAIDER_MANAGED_WORKFLOW_PATH} in ${target.repositoryName}. Check the token's workflow-file write permission.`
          : `Group target ${target.groupId} failed for repository ${target.repositoryName}.`,
        error instanceof WorkflowDeploymentPermissionError
          ? DiagnosticCode.WorkflowDeploymentForbidden
          : "group_target_execution_failed"
      );
      return {
        targets: [
          ...results,
          {
            target,
            htmlUrl: repository?.htmlUrl ?? null,
            cloneUrl: repository === null ? null : `${repository.htmlUrl}.git`,
            status: "failed",
            diagnostics: [diagnostic]
          }
        ],
        warnings,
        errors: [...errors, diagnostic]
      };
    }
  }
  return { targets: results, warnings, errors };
};
