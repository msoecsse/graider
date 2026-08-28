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
const GITHUB_API_ROOT = "https://api.github.com";

interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}
type FetchImplementation = (
  input: string,
  init: {
    readonly method?: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body?: string;
  }
) => Promise<FetchResponse>;
interface TemplateWorkflowServiceOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImplementation?: FetchImplementation;
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
const getContent = (value: unknown): { content: string; sha: string } | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.content !== "string" ||
    typeof record.sha !== "string" ||
    (record.encoding !== undefined && record.encoding !== "base64")
  )
    return null;
  try {
    return {
      content: Buffer.from(record.content.replace(/\s/gu, ""), "base64").toString("utf8"),
      sha: record.sha
    };
  } catch {
    return null;
  }
};
const resolve = async (
  request: TemplateWorkflowRequest,
  options: TemplateWorkflowServiceOptions
): Promise<
  | { token: string; fetchImplementation: FetchImplementation; owner: string; repo: string }
  | TemplateWorkflowResult
> => {
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
  const tokenResult = await (
    options.resolveToken ?? (() => resolveGithubToken({ env: options.env, runner: options.runner }))
  )();
  if (tokenResult.status === "failure")
    return workflowResult(request, "auth_required", [
      diagnostic("GitHub authentication is required. Run gh auth login, then refresh.")
    ]);
  const [owner, repo] = repository.split("/");
  if (owner === undefined || repo === undefined)
    return workflowResult(request, "not_configured", [
      diagnostic("Template repository must use owner/repo.")
    ]);
  return {
    token: tokenResult.token,
    fetchImplementation: options.fetchImplementation ?? (globalThis.fetch as FetchImplementation),
    owner,
    repo
  };
};
const headersFor = (token: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28"
});
const urlFor = (owner: string, repo: string, path: string, branch: string): string =>
  `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch)}`;

export const getTemplateWorkflow = async (
  request: TemplateWorkflowRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowResult> => {
  const resolved = await resolve(request, options);
  if ("status" in resolved) return resolved;
  const { token, fetchImplementation, owner, repo } = resolved;
  const headers = headersFor(token);
  try {
    const repoResponse = await fetchImplementation(
      `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers }
    );
    if (!repoResponse.ok)
      return workflowResult(
        request,
        repoResponse.status === 401 || repoResponse.status === 403 ? "auth_required" : "error",
        [diagnostic("The template repository could not be accessed.")]
      );
    const fileResponse = await fetchImplementation(
      urlFor(owner, repo, pathFor(request), request.templateBranch!.trim()),
      { headers }
    );
    if (fileResponse.status === 404)
      return workflowResult(request, "missing", [
        diagnostic(`No ${pathFor(request)} was found in the template repository on this branch.`)
      ]);
    if (!fileResponse.ok)
      return workflowResult(
        request,
        fileResponse.status === 401 || fileResponse.status === 403 ? "auth_required" : "error",
        [diagnostic("Unable to fetch the grade workflow file.")]
      );
    const file = getContent(await fileResponse.json());
    return file === null
      ? workflowResult(request, "error", [
          diagnostic("GitHub returned workflow content in an unsupported format.")
        ])
      : workflowResult(request, "success", [], file.content, file.sha);
  } catch {
    return workflowResult(request, "error", [
      diagnostic("Unable to reach GitHub to fetch the grade workflow.")
    ]);
  }
};

export const previewTemplateWorkflowSave = async (
  request: TemplateWorkflowSaveRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowSavePreview> => {
  if (request.content.trim().length === 0)
    return savePreview(request, "error", null, [diagnostic("Workflow content cannot be blank.")]);
  const remote = await getTemplateWorkflow(request, options);
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
    return savePreview(request, "conflict", operation, [
      diagnostic(
        "The workflow changed in the template repository after it was loaded. Reload the workflow before saving."
      )
    ]);
  return savePreview(request, "ready", operation);
};

export const saveTemplateWorkflow = async (
  request: TemplateWorkflowSaveRequest,
  options: TemplateWorkflowServiceOptions
): Promise<TemplateWorkflowSaveResult> => {
  const preview = await previewTemplateWorkflowSave(request, options);
  if (!request.confirmed || preview.status !== "ready" || preview.operation === null)
    return { ...preview, commitSha: null, commitUrl: null };
  const resolved = await resolve(request, options);
  if ("status" in resolved)
    return {
      ...savePreview(
        request,
        resolved.status === "missing" || resolved.status === "success" ? "error" : resolved.status,
        null,
        resolved.diagnostics
      ),
      commitSha: null,
      commitUrl: null
    };
  const { token, fetchImplementation, owner, repo } = resolved;
  const body = {
    message: preview.commitMessage,
    content: Buffer.from(request.content, "utf8").toString("base64"),
    branch: request.templateBranch,
    ...(preview.operation === "update" ? { sha: request.loadedSha } : {})
  };
  try {
    const response = await fetchImplementation(
      `${GITHUB_API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathFor(request).split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "PUT",
        headers: { ...headersFor(token), "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    if (response.status === 409 || response.status === 422)
      return {
        ...savePreview(request, "conflict", preview.operation, [
          diagnostic(
            "The workflow changed in the template repository after it was loaded. Reload the workflow before saving."
          )
        ]),
        commitSha: null,
        commitUrl: null
      };
    if (!response.ok)
      return {
        ...savePreview(
          request,
          response.status === 401 || response.status === 403 ? "auth_required" : "error",
          preview.operation,
          [diagnostic("Unable to push the grade workflow.")]
        ),
        commitSha: null,
        commitUrl: null
      };
    const data = (await response.json()) as Record<string, unknown>;
    const commit =
      typeof data.commit === "object" && data.commit !== null
        ? (data.commit as Record<string, unknown>)
        : {};
    return {
      ...savePreview(request, "ready", preview.operation),
      status: "success",
      commitSha: typeof commit.sha === "string" ? commit.sha : null,
      commitUrl: typeof commit.html_url === "string" ? commit.html_url : null
    };
  } catch {
    return {
      ...savePreview(request, "error", preview.operation, [
        diagnostic("Unable to reach GitHub to push the grade workflow.")
      ]),
      commitSha: null,
      commitUrl: null
    };
  }
};
