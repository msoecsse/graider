import {
  provideGithubClient,
  type GithubClientProvider,
  type GitHubClient
} from "./githubClientProvider.js";
import type { ProcessRunner } from "./commandRunner.js";
import type {
  TemplateWorkflowRequest,
  TemplateWorkflowResult,
  TemplateWorkflowSavePreview,
  TemplateWorkflowSaveRequest,
  TemplateWorkflowSaveResult
} from "./ipc.js";
import { resolveGithubToken, type GithubTokenResolution } from "./tokenResolver.js";

const DEFAULT_WORKFLOW_PATH = ".github/workflows/grade.yml";
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
interface TemplateWorkflowServiceOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly provideClient?: GithubClientProvider;
  readonly resolveToken?: () => Promise<GithubTokenResolution>;
  readonly runner: ProcessRunner;
}
const diagnostic = (message: string) => ({ message });
const pathFor = (request: TemplateWorkflowRequest): string =>
  request.workflowPath?.trim() || DEFAULT_WORKFLOW_PATH;
const metadata = (request: TemplateWorkflowRequest) => ({
  repository: request.templateRepository,
  branch: request.templateBranch,
  path: pathFor(request)
});
const workflowResult = (
  request: TemplateWorkflowRequest,
  status: TemplateWorkflowResult["status"],
  diagnostics: readonly { message: string }[] = [],
  content: string | null = null,
  sha: string | null = null
): TemplateWorkflowResult => ({ status, ...metadata(request), content, sha, diagnostics });
const savePreview = (
  request: TemplateWorkflowSaveRequest,
  status: TemplateWorkflowSavePreview["status"],
  operation: "create" | "update" | null,
  diagnostics: readonly { message: string }[] = []
): TemplateWorkflowSavePreview => ({
  status,
  operation,
  ...metadata(request),
  commitMessage: request.assignmentSlug?.trim()
    ? `Update grading workflow for ${request.assignmentSlug.trim()}`
    : null,
  diagnostics
});

interface ResolvedWorkflowClient {
  readonly githubClient: GitHubClient;
  readonly owner: string;
  readonly repo: string;
}

const authRequired = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === "GitHubClientError" &&
  "kind" in error &&
  (error.kind === "auth_missing" ||
    error.kind === "auth_failed" ||
    error.kind === "permission_denied");

const apiFailure = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === "GitHubClientError" &&
  "kind" in error &&
  (authRequired(error) || error.kind === "rate_limited" || error.kind === "api_error");

const conflictMessage =
  "The workflow changed in the template repository after it was loaded. Reload the workflow before saving.";

const resolve = async (
  request: TemplateWorkflowRequest,
  options: TemplateWorkflowServiceOptions
): Promise<ResolvedWorkflowClient | TemplateWorkflowResult> => {
  const repository = request.templateRepository?.trim() ?? "";
  const branch = request.templateBranch?.trim() ?? "";
  if (!request.gradingEnabled || !REPOSITORY_PATTERN.test(repository) || branch.length === 0)
    return workflowResult(request, "not_configured", [
      diagnostic(
        !request.gradingEnabled
          ? "Grading is disabled for this assignment."
          : "A valid template repository and branch are required."
      )
    ]);
  const [owner, repo] = repository.split("/");
  if (owner === undefined || repo === undefined)
    return workflowResult(request, "not_configured", [
      diagnostic("Template repository must use owner/repo.")
    ]);
  const tokenResult = await (
    options.resolveToken ?? (() => resolveGithubToken({ env: options.env, runner: options.runner }))
  )();
  if (tokenResult.status === "failure")
    return workflowResult(request, "auth_required", [
      diagnostic("GitHub authentication is required. Run gh auth login, then refresh.")
    ]);
  try {
    return {
      githubClient: (options.provideClient ?? provideGithubClient)(tokenResult.token),
      owner,
      repo
    };
  } catch {
    return workflowResult(request, "error", [
      diagnostic("Unable to reach GitHub to fetch the grade workflow.")
    ]);
  }
};

const readWorkflow = async (
  request: TemplateWorkflowRequest,
  { githubClient, owner, repo }: ResolvedWorkflowClient
): Promise<TemplateWorkflowResult> => {
  let stage: "repository" | "file" = "repository";
  try {
    const repository = await githubClient.getRepository(owner, repo);
    if (repository === null)
      return workflowResult(request, "error", [
        diagnostic("The template repository could not be accessed.")
      ]);
    stage = "file";
    const result = await githubClient.readRepositoryFile(
      owner,
      repo,
      pathFor(request),
      request.templateBranch!.trim()
    );
    if (result.status === "missing")
      return workflowResult(request, "missing", [
        diagnostic(`No ${pathFor(request)} was found in the template repository on this branch.`)
      ]);
    if (result.status === "unsupported")
      return workflowResult(request, "error", [
        diagnostic("GitHub returned workflow content in an unsupported format.")
      ]);
    return workflowResult(request, "success", [], result.file.content, result.file.blobSha);
  } catch (error) {
    // Bundled CJS domain errors retain their public name/kind, not constructor identity.
    return workflowResult(request, authRequired(error) ? "auth_required" : "error", [
      diagnostic(
        apiFailure(error)
          ? stage === "repository"
            ? "The template repository could not be accessed."
            : "Unable to fetch the grade workflow file."
          : "Unable to reach GitHub to fetch the grade workflow."
      )
    ]);
  }
};

export const getTemplateWorkflow = async (
  request: TemplateWorkflowRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowResult> => {
  const resolved = await resolve(request, options);
  return "status" in resolved ? resolved : readWorkflow(request, resolved);
};

const previewFromRemote = (
  request: TemplateWorkflowSaveRequest,
  remote: TemplateWorkflowResult
): TemplateWorkflowSavePreview => {
  if (
    remote.status === "not_configured" ||
    remote.status === "auth_required" ||
    remote.status === "error"
  )
    return savePreview(request, remote.status, null, remote.diagnostics);
  const operation = remote.status === "missing" ? "create" : "update";
  if (remote.status === "success" && remote.content === request.content)
    return savePreview(request, "no_changes", operation, [
      diagnostic("No workflow changes to save.")
    ]);
  if (
    (remote.status === "success" && remote.sha !== request.loadedSha) ||
    (remote.status === "missing" && request.loadedSha !== null)
  )
    return savePreview(request, "conflict", operation, [diagnostic(conflictMessage)]);
  return savePreview(request, "ready", operation);
};

const blankDraftPreview = (request: TemplateWorkflowSaveRequest): TemplateWorkflowSavePreview =>
  savePreview(request, "error", null, [diagnostic("Workflow content cannot be blank.")]);

export const previewTemplateWorkflowSave = async (
  request: TemplateWorkflowSaveRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowSavePreview> => {
  if (request.content.trim().length === 0) return blankDraftPreview(request);
  const resolved = await resolve(request, options);
  const remote = "status" in resolved ? resolved : await readWorkflow(request, resolved);
  return previewFromRemote(request, remote);
};

export const saveTemplateWorkflow = async (
  request: TemplateWorkflowSaveRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowSaveResult> => {
  if (request.content.trim().length === 0)
    return { ...blankDraftPreview(request), commitSha: null, commitUrl: null };
  const resolved = await resolve(request, options);
  const remote = "status" in resolved ? resolved : await readWorkflow(request, resolved);
  const preview = previewFromRemote(request, remote);
  if (
    !request.confirmed ||
    preview.status !== "ready" ||
    preview.operation === null ||
    "status" in resolved
  )
    return { ...preview, commitSha: null, commitUrl: null };
  try {
    const result = await resolved.githubClient.conditionalWriteRepositoryFile({
      owner: resolved.owner,
      repo: resolved.repo,
      path: pathFor(request),
      branch: request.templateBranch!,
      content: request.content,
      message: preview.commitMessage ?? "",
      expectedBlobSha: preview.operation === "create" ? null : request.loadedSha
    });
    if (result.status === "conflict")
      return {
        ...savePreview(request, "conflict", preview.operation, [diagnostic(conflictMessage)]),
        commitSha: null,
        commitUrl: null
      };
    return {
      ...preview,
      status: "success",
      commitSha: result.commitSha,
      commitUrl: result.commitUrl
    };
  } catch (error) {
    return {
      ...savePreview(request, authRequired(error) ? "auth_required" : "error", preview.operation, [
        diagnostic(
          apiFailure(error)
            ? "Unable to push the grade workflow."
            : "Unable to reach GitHub to push the grade workflow."
        )
      ]),
      commitSha: null,
      commitUrl: null
    };
  }
};
