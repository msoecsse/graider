import type { LoadedGraiderConfig } from "../config/config-models.js";
import { createConfigDiagnostic, createWarningDiagnostic } from "../diagnostics/error-catalog.js";
import type { Diagnostic } from "../diagnostics/diagnostic.js";
import type { GitHubClient } from "../github/github-client.js";
import { parseTemplateRepository } from "../config/github-config-validation.js";
import { getWorkflowDispatchIdentifier } from "../workflows/workflow-paths.js";
import type { GroupApplyPreviewTarget } from "./group-preview-planner.js";

export interface GroupTargetExecutionResult {
  readonly targets: readonly GroupTargetExecutionTargetResult[];
  readonly warnings: readonly Diagnostic[];
  readonly errors: readonly Diagnostic[];
}
export interface GroupTargetExecutionTargetResult {
  readonly target: GroupApplyPreviewTarget;
  readonly htmlUrl: string | null;
  readonly cloneUrl: string | null;
  readonly status: "created" | "failed";
  readonly diagnostics: readonly Diagnostic[];
}

const failure = (target: GroupApplyPreviewTarget, message: string): Diagnostic =>
  createConfigDiagnostic("group_target_execution_failed", message, {
    groupId: target.groupId,
    repositoryName: target.repositoryName
  });

/** In-memory, fail-fast executor. It deliberately does not read or write manifests. */
export const executeGroupTargets = async (input: {
  config: LoadedGraiderConfig;
  targets: readonly GroupApplyPreviewTarget[];
  githubClient: GitHubClient;
}): Promise<GroupTargetExecutionResult> => {
  const results: GroupTargetExecutionTargetResult[] = [];
  const warnings: Diagnostic[] = [];
  const errors: Diagnostic[] = [];
  const template = parseTemplateRepository(
    input.config.course.github.organization,
    input.config.assignment.template.repository
  );
  if (template.status === "failure")
    return { targets: results, warnings, errors: [template.diagnostic] };
  for (const target of input.targets) {
    try {
      const existing = await input.githubClient.getRepository(
        input.config.course.github.organization,
        target.repositoryName
      );
      if (existing !== null) {
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
      await input.githubClient.createRepositoryFromTemplate({
        templateOwner: template.repository.owner,
        templateRepo: template.repository.repo,
        owner: input.config.course.github.organization,
        name: target.repositoryName,
        private: true
      });
      const repository = await input.githubClient.getRepository(
        input.config.course.github.organization,
        target.repositoryName
      );
      if (repository === null) throw new Error("Repository creation was not observable.");
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
      await input.githubClient.addTeamPermission({
        owner: repository.owner,
        repo: repository.name,
        teamSlug: target.graderTeam,
        permission: target.graderTeamPermission as never
      });
      if (
        input.config.summary.gradingEnabled &&
        input.config.course.grading.workflow !== undefined
      ) {
        const workflow = await input.githubClient.getWorkflow(
          repository.owner,
          repository.name,
          getWorkflowDispatchIdentifier(input.config.course.grading.workflow)
        );
        if (workflow === null)
          warnings.push(
            createWarningDiagnostic(
              "grading_workflow_pending",
              `Grading workflow is not observable yet for newly created ${repository.name}; it may still be becoming available.`,
              { groupId: target.groupId, repositoryName: repository.name }
            )
          );
      }
      results.push({
        target,
        htmlUrl: repository.htmlUrl,
        cloneUrl: `${repository.htmlUrl}.git`,
        status: "created",
        diagnostics: []
      });
    } catch {
      const diagnostic = failure(
        target,
        `Group target ${target.groupId} failed for repository ${target.repositoryName}.`
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
  }
  return { targets: results, warnings, errors };
};
