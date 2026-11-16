import { withApplyPerformance, measureApplyPhase } from "../github/apply-performance.js";
import { runAssignmentApplyCommand } from "../cli/commands/assignment.command.js";
import { normalizeCommonCommandOptions } from "../core/command-context.js";
import { createCommandResult } from "../core/command-result.js";
import { registerCourseRuntimeRoot } from "../core/course-runtime-paths.js";
import { createConfigDiagnostic } from "../diagnostics/error-catalog.js";
import { formatCommandResultAsJson, type CliJsonOutput } from "../cli/output.js";
import { resolveProductionGitHubClient } from "../github/github-client-composition.js";
import type { GitHubClient } from "../github/github-client.js";
import { createDugiteGitWorkspaceFactory } from "../git/dugite-git-workspace-context.js";
import { createRemoteName } from "../git/git-workspace.js";
import type { ApplyRepositoryProgressObserver } from "./apply-progress.js";
import {
  assertAuthoritativeLegacyCourse,
  AuthoritativeLegacyCourseError,
  GITHUB_MUTATION_METHODS,
  type LegacyCourseExpectation
} from "./authoritative-legacy-course.js";

export interface ManagedAssignmentApplyRequest {
  readonly root: string;
  readonly assignmentFile: string;
  readonly token: string;
  readonly runtimeRoot?: string | undefined;
  readonly binding: LegacyCourseExpectation;
  /** Live guard capability, never serialized or accepted from a renderer. */
  readonly revalidate: () => Promise<void>;
  readonly onProgress?: ApplyRepositoryProgressObserver | undefined;
}
export interface ManagedAssignmentApplyResult extends Omit<
  CliJsonOutput,
  "commandName" | "assignmentFile"
> {
  readonly commandName: "assignment apply";
  readonly assignmentFile: string;
}

/** Electron backend adapter; standalone CLI retains its independent preAction boundary. */
const runManagedAssignmentApplyInternal = async (
  request: ManagedAssignmentApplyRequest,
  dependencies: { readonly githubClient?: GitHubClient } = {}
): Promise<ManagedAssignmentApplyResult> => {
  const resolution = resolveProductionGitHubClient({ token: request.token, ...dependencies });
  const client = resolution.status === "available" ? resolution.githubClient : undefined;
  const revalidate = async () => {
    try {
      await request.revalidate();
    } catch (error) {
      const reason = (error as { result?: { reason?: unknown } } | null)?.result?.reason;
      throw new AuthoritativeLegacyCourseError(
        reason === "remote_version_conflict"
          ? "course_revision_changed"
          : reason === "operational_source_stale"
            ? "course_revision_mismatch"
            : reason === "authorization_required"
              ? "course_account_unverified"
              : reason === "course_access_lost"
                ? "course_access_denied"
                : reason === "organization_migration_required"
                  ? "course_repository_mismatch"
                  : "course_authorization_changed"
      );
    }
  };
  try {
    if (!client) throw new AuthoritativeLegacyCourseError("course_account_unverified");
    const workspace = await createDugiteGitWorkspaceFactory().open(request.root);
    const origin = createRemoteName("origin");
    if (!origin) throw new AuthoritativeLegacyCourseError("course_local_state_unavailable");
    const readLocalState = async () => ({
      remoteUrl: (await workspace.remoteUrl(origin)) ?? "",
      localRevision: await workspace.resolveHead()
    });
    const validate = async () => {
      await assertAuthoritativeLegacyCourse({
        root: request.root,
        client,
        ...(await readLocalState()),
        readLocalState,
        managedAuthorization: { binding: request.binding, revalidate }
      });
    };
    await measureApplyPhase("readiness", validate);
    if (request.runtimeRoot) registerCourseRuntimeRoot(request.root, request.runtimeRoot);
    const guarded = new Proxy(client, {
      get(target, key) {
        const method = target[key as keyof GitHubClient];
        if (typeof method !== "function") return method;
        return GITHUB_MUTATION_METHODS.includes(key as keyof GitHubClient)
          ? async (...args: unknown[]) => {
              await validate();
              return Reflect.apply(method, target, args) as unknown;
            }
          : method.bind(target);
      }
    });
    const result = await runAssignmentApplyCommand({
      cwd: request.root,
      assignmentFile: request.assignmentFile,
      options: normalizeCommonCommandOptions({ json: true, yes: true }),
      githubClient: guarded,
      ...(request.onProgress === undefined ? {} : { onRepositoryProgress: request.onProgress })
    });
    return JSON.parse(formatCommandResultAsJson(result)) as ManagedAssignmentApplyResult;
  } catch (error) {
    const failure =
      error instanceof AuthoritativeLegacyCourseError
        ? error
        : new AuthoritativeLegacyCourseError("course_local_state_unavailable");
    return JSON.parse(
      formatCommandResultAsJson(
        createCommandResult({
          commandName: "assignment apply",
          assignmentFile: request.assignmentFile,
          status: "failure",
          warnings: [],
          errors: [createConfigDiagnostic(failure.diagnosticCode, failure.message)],
          generatedFiles: [],
          summary: { operationAvailable: false }
        })
      )
    ) as ManagedAssignmentApplyResult;
  }
};

export const runManagedAssignmentApply = (
  request: ManagedAssignmentApplyRequest,
  dependencies: { readonly githubClient?: GitHubClient } = {}
): Promise<ManagedAssignmentApplyResult> =>
  withApplyPerformance(() => runManagedAssignmentApplyInternal(request, dependencies));
